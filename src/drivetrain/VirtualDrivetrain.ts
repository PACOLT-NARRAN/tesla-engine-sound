import type { DrivetrainEvent, DrivetrainState } from '../types/drivetrain.ts';
import type { EngineProfile } from '../types/profile.ts';
import { clamp, expApproach, lerp, smoothstep } from '../utils/math.ts';
import { engineRpmInGear, selectGear } from './gearbox.ts';
import { DRIVE_PROFILES, type DriveProfileConfig } from './driveProfiles.ts';
import { estimateThrottle, isOverrun } from './throttle.ts';

export interface DrivetrainInput {
  speed: number;
  accel: number;
  stationary: boolean;
}

const START_DURATION_S = 1.1;
const MAX_RPM_RISE_PER_S = 14000;
const MAX_RPM_FALL_PER_S = 9000;
/** Pulling away: the clutch bites gradually over this long (s), so the revs swell instead of jumping. */
const LAUNCH_ENGAGE_S = 1.1;
/** RPM rise limit while pulling away from rest (rpm/s at no / full throttle). */
const LAUNCH_RISE_MIN = 1400;
const LAUNCH_RISE_MAX = 4200;
/** Manual gear choice returns to automatic after this long without another scroll. */
export const MANUAL_HOLD_S = 15;
/** How fast the engine climbs while the REV pedal is held (rpm/s). */
const REV_RISE_PER_S = 9000;
/** Manual mode: a gear whose RPM would fall below idle × this is refused / left (anti-stall). */
export const STALL_FACTOR = 0.85;
/** Manual mode: a downshift whose RPM would pass limiter − this margin is refused (redline protection). */
export const OVER_REV_MARGIN = 150;
/** Virtual pedal smoothing (s): rise / fall. Short fall = lifting off is heard at once. */
const THROTTLE_RISE_TAU = 0.09;
const THROTTLE_FALL_TAU = 0.08;
/** |accel| below this (m/s²) counts as steady cruising; after STEADY_TIME_S the gearbox settles. */
const STEADY_ACCEL = 0.35;
const STEADY_TIME_S = 1.2;
/** Deceleration (m/s²) that counts as braking: faster, earlier downshifts. */
const BRAKING_ACCEL = -1.2;
/** Lift-off gear hold (SPORT / TRACK) lasts this long unless the car brakes hard. */
const LIFT_HOLD_S = 5;
/** Below this speed (m/s) the car counts as standing for manual-mode neutral. */
const STANDING_MS = 0.5;

export type Transmission = 'auto' | 'manual';

/** Result of a manual shift request. */
export type ManualShiftResult =
  | 'applied'
  | 'not-running'
  | 'no-gear' // automatic mode, car standing: no automatic gear to offset
  | 'at-limit' // already in 1st / top gear (manual mode: or neutral)
  | 'out-of-range' // automatic mode: the override would leave the usable rev range
  | 'over-rev' // manual mode: downshift would pass the rev limiter
  | 'would-stall'; // manual mode: upshift would drop the engine below idle

/**
 * Simulated combustion drivetrain: turns speed + acceleration into throttle, gear and RPM.
 * RPM is derived from speed THROUGH the selected gear ratio and final drive, plus clutch
 * slip at launch, shift transients, engine inertia and a rev limiter.
 */
export class VirtualDrivetrain {
  private profile: EngineProfile;
  private readonly s: DrivetrainState;
  private sinceShift = 10;
  private shiftFromRpm = 0;
  private shiftElapsed = 0;
  private shiftLength = 0;
  private startElapsed = Infinity;
  private wasOverrun = false;
  private limiterPhase = 0;
  /** Slower-moving throttle used for shift decisions, so brief pedal changes don't trigger shifts. */
  private shiftThrottle = 0;
  /** Gear the automatic gearbox would pick; the engaged gear is this plus the manual offset. */
  private autoGear = 0;
  private sinceAutoShift = 10;
  private manualIdle = 0;
  /** Vehicle speed of the last update (m/s), to judge manual shift requests immediately. */
  private lastSpeed = 0;
  private revRpm = 0;
  /** Seconds since the car left standstill (Infinity once rolling for a while). */
  private launchT = Infinity;
  private revReleaseOverrun = 0;
  private drive: DriveProfileConfig;
  /** Manual mode: the gear the driver chose (applied by the next update). */
  private manualGear = 0;
  /** Seconds the speed has been nearly constant (cruising). */
  private steadyTime = 0;
  /** Seconds of the current lift-off. */
  private overrunTime = 0;

  constructor(profile: EngineProfile, drive: DriveProfileConfig = DRIVE_PROFILES.sport) {
    this.profile = profile;
    this.drive = drive;
    this.s = {
      speed: 0, accel: 0, throttle: 0, load: 0, rpm: 0, targetRpm: 0, gear: 0,
      shifting: false, shiftDirection: null, shiftProgress: 0, overrun: false, limiter: false, running: false,
      manualOffset: 0, revPedal: false, transmission: 'auto',
    };
  }

  get state(): Readonly<DrivetrainState> {
    return this.s;
  }

  setProfile(profile: EngineProfile): void {
    this.profile = profile;
    this.s.gear = Math.min(this.s.gear, profile.gearbox.gearRatios.length);
    this.manualGear = Math.min(this.manualGear, profile.gearbox.gearRatios.length);
  }

  /** Drive Profile tuning used by the drivetrain itself (pedal response, blip, lift-off hold). */
  setDriveProfile(drive: DriveProfileConfig): void {
    this.drive = drive;
  }

  get driveProfile(): DriveProfileConfig {
    return this.drive;
  }

  /**
   * Automatic ↔ manual. The engaged gear is kept, so switching never jumps the revs.
   * Back to automatic, the gearbox continues from the current gear without a manual offset.
   */
  setTransmission(t: Transmission): void {
    if (t === this.s.transmission) return;
    this.s.transmission = t;
    this.s.manualOffset = 0;
    if (t === 'manual') this.manualGear = this.s.gear;
    else {
      this.autoGear = this.s.gear;
      this.sinceAutoShift = 0;
    }
  }

  /** Ignition: engine cranks and flares above idle before settling. */
  ignite(): void {
    this.s.running = true;
    this.s.rpm = this.profile.idleRPM * 0.25;
    this.startElapsed = 0;
  }

  shutdown(): void {
    this.s.running = false;
    this.s.gear = 0;
    this.autoGear = 0;
    this.manualGear = 0;
    this.s.manualOffset = 0;
    this.s.revPedal = false;
    this.s.throttle = 0;
    this.s.load = 0;
  }

  /**
   * Shift request. Automatic mode: one gear lower (-1) / higher (+1) than the automatic choice,
   * as far as 1st / top gear and the rev range allow (repeated taps skip several gears), back to
   * automatic after MANUAL_HOLD_S. Manual mode: the next gear itself, with
   * redline and anti-stall protection; neutral only while standing.
   */
  manualShift(direction: -1 | 1): ManualShiftResult {
    if (!this.s.running) return 'not-running';
    if (this.s.transmission === 'manual') return this.manualModeShift(direction);
    if (this.autoGear === 0) return 'no-gear';
    const top = this.profile.gearbox.gearRatios.length;
    const next = clamp(this.s.manualOffset + direction, 1 - this.autoGear, top - this.autoGear);
    this.manualIdle = 0;
    if (next === this.s.manualOffset) return 'at-limit';
    // First / top gear, or a gear that would pass the limiter / stall: refuse now instead of
    // accepting and silently reverting on the next update.
    if (this.gearForOffset(next) === this.gearForOffset(this.s.manualOffset)) return 'out-of-range';
    this.s.manualOffset = next;
    return 'applied';
  }

  /** Engine RPM the given gear would give at the current speed (0 for neutral). */
  rpmInGear(gear: number): number {
    return engineRpmInGear(this.lastSpeed, gear, this.profile.gearbox);
  }

  private manualModeShift(direction: -1 | 1): ManualShiftResult {
    const p = this.profile;
    const top = p.gearbox.gearRatios.length;
    const from = this.manualGear;
    const standing = this.lastSpeed < STANDING_MS;
    if (direction === 1) {
      if (from >= top) return 'at-limit';
      const to = from + 1;
      // Upshift from neutral to 1st, or while standing, is always fine (clutch).
      if (from > 0 && !standing && this.rpmInGear(to) < p.idleRPM * STALL_FACTOR) return 'would-stall';
      this.manualGear = to;
      return 'applied';
    }
    if (from === 0) return 'at-limit';
    if (from === 1) {
      if (!standing) return 'at-limit'; // neutral only while standing
      this.manualGear = 0;
      return 'applied';
    }
    const to = from - 1;
    if (this.rpmInGear(to) > p.limiterRPM - OVER_REV_MARGIN) return 'over-rev';
    this.manualGear = to;
    return 'applied';
  }

  private gearForOffset(offset: number): number {
    const top = this.profile.gearbox.gearRatios.length;
    return this.withinRevRange(clamp(this.autoGear + offset, 1, top), this.lastSpeed);
  }

  /** REV pedal: while held the clutch is in and the engine revs freely toward the limiter. */
  setRevPedal(down: boolean): void {
    if (!down && this.s.revPedal) {
      // Snap-closed throttle from high revs: let the exhaust crackle as the revs fall.
      this.revReleaseOverrun = this.s.rpm > this.s.targetRpm + 800 || this.s.rpm > this.profile.idleRPM * 2.5 ? 0.9 : 0;
    }
    this.s.revPedal = down && this.s.running;
    if (this.s.revPedal) this.revRpm = Math.max(this.revRpm, this.s.rpm);
  }

  update(dt: number, input: DrivetrainInput): DrivetrainEvent[] {
    const events: DrivetrainEvent[] = [];
    const p = this.profile;
    const gb = p.gearbox;
    const s = this.s;
    dt = clamp(dt, 0, 0.25);

    s.speed = input.speed;
    s.accel = input.accel;
    if (!s.running) {
      s.rpm = expApproach(s.rpm, 0, dt, 0.25);
      s.targetRpm = 0;
      return events;
    }

    // Pulling-away timer.
    if (input.stationary || input.speed < 0.3) this.launchT = 0;
    else if (this.launchT < 10) this.launchT += dt;

    // 1) Virtual pedal.
    const rawThrottle = estimateThrottle(input.speed, input.accel, Math.max(1, s.gear), gb, p.dynamics);
    const tau = (rawThrottle > s.throttle ? THROTTLE_RISE_TAU : THROTTLE_FALL_TAU) / this.drive.throttleResponse;
    s.throttle = expApproach(s.throttle, rawThrottle, dt, tau);
    this.shiftThrottle = expApproach(this.shiftThrottle, s.throttle, dt, s.throttle > this.shiftThrottle ? 0.25 : 0.5);
    // Cruising = nearly constant speed under a little power (coasting / engine braking is not cruising).
    this.steadyTime = Math.abs(input.accel) < STEADY_ACCEL && input.speed > 2 && rawThrottle > 0.02 ? this.steadyTime + dt : 0;
    s.overrun = isOverrun(input.speed, input.accel);
    if (this.revReleaseOverrun > 0) {
      this.revReleaseOverrun -= dt;
      s.overrun = true;
    }
    if (s.revPedal) s.overrun = false;
    // Lift-off: engine braking, or rolling without throttle.
    const liftOff = s.overrun || (s.throttle < 0.03 && input.accel < 0 && input.speed > 2);
    this.overrunTime = liftOff ? this.overrunTime + dt : 0;
    if (s.overrun && !this.wasOverrun) events.push({ type: 'overrun-start', rpm: s.rpm });
    this.wasOverrun = s.overrun;

    // 2) Gear selection (blocked while a shift is in progress or the clutch is in).
    this.sinceShift += dt;
    this.sinceAutoShift += dt;
    this.manualIdle += dt;
    this.lastSpeed = input.speed;
    if (!s.shifting && !s.revPedal) {
      const next = s.transmission === 'manual' ? this.nextManualGear(input) : this.nextAutoGear(input);
      if (next !== s.gear) {
        const realShift = s.gear > 0 && next > 0;
        if (realShift) {
          const direction = next > s.gear ? 'up' : 'down';
          events.push({ type: 'shift', direction, from: s.gear, to: next, throttle: s.throttle });
          s.shifting = true;
          s.shiftDirection = direction;
          this.shiftFromRpm = s.rpm;
          this.shiftElapsed = 0;
          // Hard shifts are quicker; downshifts with rev-match are quick too.
          this.shiftLength = gb.shiftDuration * (direction === 'up' ? lerp(1.15, 0.6, s.throttle) : 0.75);
        }
        s.gear = next;
        this.sinceShift = 0;
      }
    }

    // 3) Target RPM through the drivetrain.
    let target: number;
    if (s.gear === 0) {
      target = p.idleRPM;
    } else {
      const geared = engineRpmInGear(input.speed, s.gear, gb);
      if (s.gear === 1) {
        // Clutch slip at launch: engine RPM leads road speed, then blends into the locked RPM.
        // Pulling away from rest the clutch bites gradually, so the slip builds up smoothly.
        const engage = smoothstep(0, LAUNCH_ENGAGE_S, this.launchT);
        const slip = p.idleRPM + Math.pow(s.throttle, 1.3) * (gb.launchRPM - p.idleRPM) * (0.35 + 0.65 * engage);
        const lock = clamp(geared / Math.max(slip, 1), 0, 1);
        target = Math.max(geared, lerp(slip, geared, lock * lock));
      } else {
        target = geared;
      }
      target = Math.max(target, p.idleRPM * (s.overrun ? 0.98 : 1));
      // Under load the engine "pulls" slightly above locked speed (torque-converter feel).
      target += s.throttle * 120;
    }

    // REV pedal: clutch in, engine climbs toward the limiter for as long as it is held.
    if (s.revPedal) {
      this.revRpm = Math.min(p.limiterRPM + 50, Math.max(this.revRpm, p.idleRPM) + REV_RISE_PER_S * dt);
      target = Math.max(target, this.revRpm);
    } else {
      this.revRpm = 0;
    }

    // Start-up flare.
    if (this.startElapsed < START_DURATION_S) {
      this.startElapsed += dt;
      const t = this.startElapsed / START_DURATION_S;
      const flare = Math.sin(Math.min(1, t) * Math.PI) * p.idleRPM * 0.7;
      target = Math.max(target, p.idleRPM + flare);
    }

    // Rev limiter.
    s.limiter = target >= p.limiterRPM;
    if (s.limiter) {
      target = p.limiterRPM;
      this.limiterPhase += dt;
      if (this.limiterPhase > 0.5) {
        events.push({ type: 'limiter' });
        this.limiterPhase = 0;
      }
    }
    s.targetRpm = target;

    // 4) Shift transient: RPM swings from the old gear to the new one with an ease curve.
    let rpmTarget = target;
    let load = s.overrun ? 0 : s.throttle;
    if (s.shifting) {
      this.shiftElapsed += dt;
      const t = clamp(this.shiftElapsed / Math.max(0.05, this.shiftLength), 0, 1);
      s.shiftProgress = t;
      const ease = 1 - Math.pow(1 - t, 3);
      if (s.shiftDirection === 'up') {
        rpmTarget = lerp(this.shiftFromRpm, target, ease);
        load = s.throttle * (t < 0.7 ? 0.12 : lerp(0.12, 1, (t - 0.7) / 0.3)); // ignition cut
      } else {
        // Throttle blip for rev-matching.
        rpmTarget = lerp(this.shiftFromRpm, target, Math.min(1, ease * 1.3));
        load = Math.max(load, this.drive.throttleBlipAmount * Math.sin(t * Math.PI));
      }
      if (t >= 1) {
        s.shifting = false;
        s.shiftDirection = null;
        s.shiftProgress = 0;
      }
    }

    if (s.revPedal) load = 1;

    // 5) Engine inertia + slew-rate limit: GPS noise cannot make the needle jump.
    const response = s.shifting ? p.dynamics.engineResponse * 0.4 : p.dynamics.engineResponse;
    let next = expApproach(s.rpm, rpmTarget, dt, response);
    let maxUp = MAX_RPM_RISE_PER_S * dt;
    // Pulling away from rest: the revs swell with the clutch instead of jumping.
    if (s.gear <= 1 && !s.revPedal && this.launchT < LAUNCH_ENGAGE_S * 1.5 && this.startElapsed >= START_DURATION_S) {
      maxUp = Math.min(maxUp, (LAUNCH_RISE_MIN + (LAUNCH_RISE_MAX - LAUNCH_RISE_MIN) * s.throttle) * dt);
    }
    const maxDown = MAX_RPM_FALL_PER_S * dt * (s.shifting ? 2 : 1);
    next = clamp(next, s.rpm - maxDown, s.rpm + maxUp);
    s.rpm = clamp(next, 0, p.limiterRPM + 150);
    s.load = clamp(load, 0, 1);
    return events;
  }

  private nextAutoGear(input: DrivetrainInput): number {
    const s = this.s;
    const gb = this.profile.gearbox;
    const auto = selectGear(
      {
        currentGear: this.autoGear, speedMs: input.speed, throttle: this.shiftThrottle, sinceLastShift: this.sinceAutoShift,
        stationary: input.stationary,
        // Lift-off hold lasts a few seconds (or while braking hard), then the gearbox settles again.
        overrun: this.overrunTime > 0 && this.drive.holdGearOnLift && (this.overrunTime < LIFT_HOLD_S || input.accel < -1.5),
        cruiseFloorRpm: this.cruiseFloorRpm(),
        steady: this.steadyTime > STEADY_TIME_S,
        braking: input.accel < BRAKING_ACCEL && input.speed > 2,
      },
      gb, this.profile.idleRPM, this.profile.limiterRPM,
    );
    if (auto !== this.autoGear) {
      this.autoGear = auto;
      this.sinceAutoShift = 0;
    }
    if (auto === 0 || this.manualIdle > MANUAL_HOLD_S) s.manualOffset = 0;
    const next = auto === 0 ? 0 : this.withinRevRange(clamp(auto + s.manualOffset, 1, gb.gearRatios.length), input.speed);
    if (auto > 0) s.manualOffset = next - auto;
    return next;
  }

  /**
   * Manual mode: the driver's gear, with two automatic recoveries that a real driver would do
   * anyway: 1st when the car stops in a higher gear, and one gear down when the engine is about
   * to stall. The engine is never over-revved by a downshift (requests are refused instead).
   */
  private nextManualGear(input: DrivetrainInput): number {
    const p = this.profile;
    const standing = input.stationary && input.speed < STANDING_MS;
    let g = this.manualGear;
    if (standing) {
      if (g > 1) g = 1;
    } else {
      if (g === 0 && input.speed > 2) g = 1; // rolling away in neutral: engage 1st
      if (g > 1 && this.sinceShift > 0.6 && engineRpmInGear(input.speed, g, p.gearbox) < p.idleRPM * STALL_FACTOR) g--;
    }
    this.manualGear = g;
    this.autoGear = g; // so switching back to automatic continues from here
    this.s.manualOffset = 0;
    return g;
  }

  /** Lowest RPM the automatic settles at while driving (Drive Profile cruise floor). */
  cruiseFloorRpm(): number {
    const p = this.profile;
    return p.idleRPM + (p.limiterRPM - p.idleRPM) * this.drive.cruiseRpmFactor;
  }

  /** Nearest gear to `gear` that keeps the engine between just above idle and just below the limiter. */
  private withinRevRange(gear: number, speedMs: number): number {
    const p = this.profile;
    const gb = p.gearbox;
    const top = gb.gearRatios.length;
    let g = gear;
    while (g < top && engineRpmInGear(speedMs, g, gb) > p.limiterRPM - 150) g++;
    while (g > 1 && g > this.autoGear && engineRpmInGear(speedMs, g, gb) < p.idleRPM * 1.15) g--;
    return g;
  }
}
