import type { GearboxConfig } from '../types/profile.ts';
import { clamp, lerp, smoothstep } from '../utils/math.ts';

/** Wheel revolutions per minute for a road speed. */
export function wheelRpm(speedMs: number, tireRadiusM: number): number {
  return (speedMs / (2 * Math.PI * tireRadiusM)) * 60;
}

/**
 * Engine RPM implied by road speed in a given gear (no clutch slip).
 * rpm = wheelRpm * gearRatio * finalDrive
 */
export function engineRpmInGear(speedMs: number, gear: number, gb: GearboxConfig): number {
  if (gear <= 0) return 0;
  const ratio = gb.gearRatios[Math.min(gear, gb.gearRatios.length) - 1] ?? 1;
  return wheelRpm(speedMs, gb.tireRadiusM) * ratio * gb.finalDrive;
}

/** Load-dependent shift points: gentle driving shifts early, full throttle holds gears. */
export function upshiftRpm(throttle: number, gb: GearboxConfig, limiterRpm: number): number {
  const t = smoothstep(0.15, 0.85, throttle);
  return Math.min(lerp(gb.shiftUpRPM.gentle, gb.shiftUpRPM.hard, t), limiterRpm - 50);
}

/** Downshift line stays low until the driver really asks for power (kick-down territory). */
export function downshiftRpm(throttle: number, gb: GearboxConfig): number {
  return lerp(gb.shiftDownRPM.gentle, gb.shiftDownRPM.hard, smoothstep(0.5, 1, clamp(throttle, 0, 1)));
}

export interface GearSelectionInput {
  currentGear: number;
  speedMs: number;
  throttle: number;
  /** Seconds since the last completed shift. */
  sinceLastShift: number;
  stationary: boolean;
  /** Lifting off: hold the gear (sport-mode behaviour) unless the engine is at the hard shift point. */
  overrun?: boolean;
}

/** Margin keeping the post-shift RPM away from the opposite threshold. */
export const SHIFT_HYSTERESIS_RPM = 350;

/**
 * Automatic gear selection with hysteresis.
 * - Upshift only if the next gear will still sit above the downshift line + margin.
 * - Downshift only if the lower gear will sit below the upshift line - margin.
 * - A minimum interval between shifts prevents hunting on noisy input.
 */
export function selectGear(input: GearSelectionInput, gb: GearboxConfig, idleRpm: number, limiterRpm: number): number {
  const { currentGear, speedMs, throttle, sinceLastShift, stationary, overrun = false } = input;
  const top = gb.gearRatios.length;

  if (stationary && speedMs < 0.3 && throttle < 0.05) return 0;
  if (currentGear <= 0) return speedMs > 0.3 || throttle > 0.05 ? 1 : 0;
  if (sinceLastShift < gb.minShiftInterval) return currentGear;

  const up = overrun ? Math.min(gb.shiftUpRPM.hard, limiterRpm - 50) : upshiftRpm(throttle, gb, limiterRpm);
  const down = Math.max(downshiftRpm(throttle, gb), idleRpm * 1.05);
  const rpm = engineRpmInGear(speedMs, currentGear, gb);

  if (currentGear < top && rpm >= up) {
    const nextRpm = engineRpmInGear(speedMs, currentGear + 1, gb);
    if (nextRpm >= down + SHIFT_HYSTERESIS_RPM * 0.5) return currentGear + 1;
  }

  if (currentGear > 1) {
    const lowerRpm = engineRpmInGear(speedMs, currentGear - 1, gb);
    const upLower = upshiftRpm(throttle, gb, limiterRpm);
    if (rpm < down && lowerRpm < upLower - SHIFT_HYSTERESIS_RPM) return currentGear - 1;
    // Kick-down: driver floors it while the engine is lugging.
    if (throttle > 0.8 && rpm < upLower * 0.6 && lowerRpm < upLower * 0.9) return currentGear - 1;
  }
  return currentGear;
}
