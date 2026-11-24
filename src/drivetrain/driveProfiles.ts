import type { EngineProfile } from '../types/profile.ts';
import { clamp } from '../utils/math.ts';

/**
 * Drive Profiles: COMFORT / SPORT / TRACK as typed configuration data. Every behaviour that
 * differs between profiles lives here. The drivetrain and the audio engine read these numbers;
 * they contain no profile-specific branches. Stored under the old settings field `shiftStyle`.
 */
export type DriveProfileId = 'comfort' | 'sport' | 'track';
export const DRIVE_PROFILE_IDS: readonly DriveProfileId[] = ['comfort', 'sport', 'track'];

export interface DriveProfileConfig {
  readonly id: DriveProfileId;
  // --- Gearbox ---------------------------------------------------------------------------
  /** Relaxed-driving upshift point: 0 = the engine's gentle shift RPM, 1 = its full-throttle shift RPM. */
  readonly upshiftRpmFactor: number;
  /** Relaxed-driving downshift point, same scale. Higher = downshifts earlier, keeps revs up. */
  readonly downshiftRpmFactor: number;
  /** Extra seconds the automatic gearbox waits between two shifts. */
  readonly gearHoldTime: number;
  /** Multiplier on the shift duration (lower = faster, harder shifts). */
  readonly shiftCooldown: number;
  /** Stay in gear when lifting off (engine braking) instead of upshifting. */
  readonly holdGearOnLift: boolean;
  /**
   * Cruise floor: the lowest RPM the automatic settles at while driving, as a fraction of the
   * idle → limiter range. Higher = livelier, never lugs in a needlessly tall gear.
   */
  readonly cruiseRpmFactor: number;
  // --- Engine response -------------------------------------------------------------------
  /** Pedal response: >1 = throttle follows the car's acceleration faster. */
  readonly throttleResponse: number;
  /** Engine response: >1 = RPM reaches its target faster (less smoothing). */
  readonly loadResponse: number;
  /** Rev-match blip on downshifts, as engine load 0..1. */
  readonly throttleBlipAmount: number;
  // --- Sound -----------------------------------------------------------------------------
  /** Multiplier on audio parameter smoothing (higher = softer transitions). */
  readonly audioTransitionSmoothing: number;
  /** Loudness of the off-throttle (engine braking) sound, 0..1. */
  readonly engineBraking: number;
  /** Multiplier on the engine's overrun crackle when lifting off. */
  readonly overrunAmount: number;
  /** Multiplier on the exhaust crack of downshifts. */
  readonly crackleAmount: number;
}

/** Safe limits for every numeric field (also used by tests and future user-made profiles). */
export const DRIVE_PROFILE_LIMITS = {
  upshiftRpmFactor: [0, 1],
  downshiftRpmFactor: [0, 1],
  gearHoldTime: [0, 1.5],
  cruiseRpmFactor: [0.05, 0.45],
  shiftCooldown: [0.5, 1.5],
  throttleResponse: [0.5, 2],
  loadResponse: [0.5, 2],
  throttleBlipAmount: [0, 0.7],
  audioTransitionSmoothing: [0.5, 2.5],
  engineBraking: [0, 1],
  overrunAmount: [0, 2],
  crackleAmount: [0, 2],
} as const satisfies Partial<Record<keyof DriveProfileConfig, readonly [number, number]>>;

export const DRIVE_PROFILES: Readonly<Record<DriveProfileId, DriveProfileConfig>> = {
  comfort: {
    id: 'comfort',
    upshiftRpmFactor: 0, downshiftRpmFactor: 0, gearHoldTime: 0, shiftCooldown: 1.25, holdGearOnLift: false, cruiseRpmFactor: 0.13,
    throttleResponse: 0.7, loadResponse: 0.75, throttleBlipAmount: 0.15,
    audioTransitionSmoothing: 1.8, engineBraking: 0.3, overrunAmount: 0.25, crackleAmount: 0.3,
  },
  // SPORT = the behaviour REVLINE had before Drive Profiles existed.
  sport: {
    id: 'sport',
    upshiftRpmFactor: 0.25, downshiftRpmFactor: 0.25, gearHoldTime: 0.3, shiftCooldown: 1, holdGearOnLift: true, cruiseRpmFactor: 0.2,
    throttleResponse: 1, loadResponse: 1, throttleBlipAmount: 0.35,
    audioTransitionSmoothing: 1, engineBraking: 0.65, overrunAmount: 1, crackleAmount: 1,
  },
  track: {
    id: 'track',
    upshiftRpmFactor: 0.55, downshiftRpmFactor: 0.5, gearHoldTime: 0.6, shiftCooldown: 0.7, holdGearOnLift: true, cruiseRpmFactor: 0.3,
    throttleResponse: 1.4, loadResponse: 1.35, throttleBlipAmount: 0.55,
    audioTransitionSmoothing: 0.55, engineBraking: 1, overrunAmount: 1.4, crackleAmount: 1.4,
  },
};

export function getDriveProfile(id: DriveProfileId): DriveProfileConfig {
  return DRIVE_PROFILES[id] ?? DRIVE_PROFILES.sport;
}

/** Clamps every numeric field into DRIVE_PROFILE_LIMITS. */
export function clampDriveProfile(c: DriveProfileConfig): DriveProfileConfig {
  const out: Record<string, unknown> = { ...c };
  for (const [k, [lo, hi]] of Object.entries(DRIVE_PROFILE_LIMITS)) {
    const v = out[k];
    out[k] = typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : lo;
  }
  return out as unknown as DriveProfileConfig;
}

/**
 * Engine profile copy with the Drive Profile applied to the fields the drivetrain and audio
 * already read: shift points, shift timing, engine response, overrun crackle, downshift crack.
 */
export function applyDriveProfile(p: EngineProfile, cfg: DriveProfileConfig): EngineProfile {
  const c = clampDriveProfile(cfg);
  const gb = p.gearbox;
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  return {
    ...p,
    gearbox: {
      ...gb,
      shiftUpRPM: { ...gb.shiftUpRPM, gentle: lerp(gb.shiftUpRPM.gentle, gb.shiftUpRPM.hard, c.upshiftRpmFactor) },
      shiftDownRPM: { ...gb.shiftDownRPM, gentle: lerp(gb.shiftDownRPM.gentle, gb.shiftDownRPM.hard, c.downshiftRpmFactor) },
      minShiftInterval: gb.minShiftInterval + c.gearHoldTime,
      shiftDuration: gb.shiftDuration * c.shiftCooldown,
    },
    dynamics: { ...p.dynamics, engineResponse: p.dynamics.engineResponse / c.loadResponse },
    audio: { ...p.audio, overrunPops: p.audio.overrunPops * c.overrunAmount, shiftBark: p.audio.shiftBark * c.crackleAmount },
  };
}
