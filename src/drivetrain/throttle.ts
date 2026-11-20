import type { EngineDynamics, GearboxConfig } from '../types/profile.ts';
import { clamp } from '../utils/math.ts';

/** Equivalent deceleration from rolling resistance + aero drag (m/s²) at a speed. */
export function resistanceDecel(speedMs: number): number {
  if (speedMs < 0.2) return 0;
  return 0.12 + 0.00028 * speedMs * speedMs;
}

/**
 * Virtual pedal position from GPS-derived acceleration.
 * Power needed = acceleration + overcoming resistance. Taller gears deliver less
 * acceleration per unit of throttle, so the same acceleration means more load in 5th than in 1st.
 */
export function estimateThrottle(
  speedMs: number,
  accel: number,
  gear: number,
  gb: GearboxConfig,
  dyn: EngineDynamics,
): number {
  const demand = accel + resistanceDecel(speedMs);
  if (demand <= 0) return 0;
  const first = gb.gearRatios[0] ?? 1;
  const ratio = gb.gearRatios[Math.max(0, Math.min(gear, gb.gearRatios.length) - 1)] ?? first;
  const available = Math.max(0.9, dyn.fullThrottleAccel * Math.pow(ratio / first, 0.85));
  return clamp((demand / available) * dyn.throttleSensitivity, 0, 1);
}

/** Lift-off / engine braking: the car slows faster than it would just rolling. */
export function isOverrun(speedMs: number, accel: number): boolean {
  return speedMs > 2 && accel + resistanceDecel(speedMs) < -0.12;
}
