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
  // Moderate pedal (typical EV pull) shifts near the relaxed point; only a real push holds gears.
  const t = smoothstep(0.35, 1, throttle);
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
  /**
   * Lowest RPM the gearbox settles at while driving (no lugging in a needlessly tall gear).
   * 0 / missing = only the engine's own downshift line.
   */
  cruiseFloorRpm?: number;
  /** Speed has been nearly constant for a while: settle into the gear nearest the cruise RPM. */
  steady?: boolean;
  /** The car is clearly braking: downshift earlier and faster (rev-matched blips). */
  braking?: boolean;
}

/** Margin keeping the post-shift RPM away from the opposite threshold. */
export const SHIFT_HYSTERESIS_RPM = 350;
/** Steady cruising above floor × this upshifts (if the next gear stays above the floor). */
export const CRUISE_UPSHIFT_FACTOR = 1.3;
/** Braking downshifts happen below floor × this. */
export const BRAKING_DOWNSHIFT_FACTOR = 1.2;
/** Shortest interval between braking downshifts (s). */
export const BRAKING_SHIFT_INTERVAL = 0.45;

/**
 * Automatic gear selection with hysteresis.
 * - Upshift at the load-dependent shift point, or while cruising steadily well above the cruise
 *   floor, but only if the next gear still sits above the downshift line + margin.
 * - Downshift when RPM falls below the downshift line or the cruise floor (no lugging), earlier
 *   and faster when braking, but only if the lower gear stays below the upshift line − margin.
 * - A minimum interval between shifts prevents hunting on noisy input.
 */
export function selectGear(input: GearSelectionInput, gb: GearboxConfig, idleRpm: number, limiterRpm: number): number {
  const { currentGear, speedMs, throttle, sinceLastShift, stationary, overrun = false, steady = false, braking = false } = input;
  const floor = input.cruiseFloorRpm ?? 0;
  const top = gb.gearRatios.length;

  if (stationary && speedMs < 0.3 && throttle < 0.05) return 0;
  if (currentGear <= 0) return speedMs > 0.3 || throttle > 0.05 ? 1 : 0;
  const interval = braking ? Math.min(gb.minShiftInterval, BRAKING_SHIFT_INTERVAL) : gb.minShiftInterval;
  if (sinceLastShift < interval) return currentGear;

  const up = overrun ? Math.min(gb.shiftUpRPM.hard, limiterRpm - 50) : upshiftRpm(throttle, gb, limiterRpm);
  const down = Math.max(downshiftRpm(throttle, gb), idleRpm * 1.05, floor * (braking ? BRAKING_DOWNSHIFT_FACTOR : 1));
  const rpm = engineRpmInGear(speedMs, currentGear, gb);

  if (currentGear < top && !braking) {
    const nextRpm = engineRpmInGear(speedMs, currentGear + 1, gb);
    const fits = nextRpm >= Math.max(down, floor) + SHIFT_HYSTERESIS_RPM * 0.5;
    if (rpm >= up && fits) return currentGear + 1;
    if (steady && !overrun && floor > 0 && rpm >= floor * CRUISE_UPSHIFT_FACTOR && fits) return currentGear + 1;
  }

  if (currentGear > 1) {
    const lowerRpm = engineRpmInGear(speedMs, currentGear - 1, gb);
    const upLower = upshiftRpm(throttle, gb, limiterRpm);
    const ceiling = Math.max(upLower, braking ? floor * CRUISE_UPSHIFT_FACTOR * 1.6 : 0);
    if (rpm < down && lowerRpm < Math.min(ceiling - SHIFT_HYSTERESIS_RPM, limiterRpm - 400)) return currentGear - 1;
    // Kick-down: driver floors it while the engine is lugging.
    if (throttle > 0.8 && rpm < upLower * 0.6 && lowerRpm < upLower * 0.9) return currentGear - 1;
  }
  return currentGear;
}
