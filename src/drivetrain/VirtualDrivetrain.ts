import type { DrivetrainEvent, DrivetrainState } from '../types/drivetrain.ts';
import type { EngineProfile } from '../types/profile.ts';
import { clamp, expApproach, lerp } from '../utils/math.ts';
import { engineRpmInGear, selectGear } from './gearbox.ts';
import { estimateThrottle, isOverrun } from './throttle.ts';

export interface DrivetrainInput {
  speed: number;
  accel: number;
  stationary: boolean;
}

const START_DURATION_S = 1.1;
const MAX_RPM_RISE_PER_S = 14000;
const MAX_RPM_FALL_PER_S = 9000;
/** Manual gear choice returns to automatic after this long without another scroll. */
export const MANUAL_HOLD_S = 15;
export const MAX_MANUAL_OFFSET = 2;
/** How fast the engine climbs while the REV pedal is held (rpm/s). */
const REV_RISE_PER_S = 9000;

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
  private revRpm = 0;
  private revReleaseOverrun = 0;

  constructor(profile: EngineProfile) {
    this.profile = profile;
    this.s = {
      speed: 0, accel: 0, throttle: 0, load: 0, rpm: 0, targetRpm: 0, gear: 0,
      shifting: false, shiftDirection: null, shiftProgress: 0, overrun: false, limiter: false, running: false,
      manualOffset: 0, revPedal: false,
    };
  }

  get state(): Readonly<DrivetrainState> {
    return this.s;
  }

  setProfile(profile: EngineProfile): void {
    this.profile = profile;
    this.s.gear = Math.min(this.s.gear, profile.gearbox.gearRatios.length);
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
    this.s.manualOffset = 0;
    this.s.revPedal = false;
    this.s.throttle = 0;
    this.s.load = 0;
  }

  /** Driver asks for one gear lower (-1) or higher (+1) than the automatic choice. */
  manualShift(direction: -1 | 1): void {
    if (!this.s.running || this.autoGear === 0) return;
    this.s.manualOffset = clamp(this.s.manualOffset + direction, -MAX_MANUAL_OFFSET, MAX_MANUAL_OFFSET);
    this.manualIdle = 0;
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

    // 1) Virtual pedal.
    const rawThrottle = estimateThrottle(input.speed, input.accel, Math.max(1, s.gear), gb, p.dynamics);
    const tau = rawThrottle > s.throttle ? 0.12 : 0.22;
    s.throttle = expApproach(s.throttle, rawThrottle, dt, tau);
    this.shiftThrottle = expApproach(this.shiftThrottle, s.throttle, dt, s.throttle > this.shiftThrottle ? 0.3 : 0.9);
    s.overrun = isOverrun(input.speed, input.accel);
    if (this.revReleaseOverrun > 0) {
      this.revReleaseOverrun -= dt;
      s.overrun = true;
    }
    if (s.revPedal) s.overrun = false;
    if (s.overrun && !this.wasOverrun) events.push({ type: 'overrun-start', rpm: s.rpm });
    this.wasOverrun = s.overrun;

    // 2) Gear selection (blocked while a shift is in progress or the clutch is in).
    this.sinceShift += dt;
    this.sinceAutoShift += dt;
    this.manualIdle += dt;
    if (!s.shifting && !s.revPedal) {
      const auto = selectGear(
        { currentGear: this.autoGear, speedMs: input.speed, throttle: this.shiftThrottle, sinceLastShift: this.sinceAutoShift, stationary: input.stationary, overrun: s.overrun },
        gb, p.idleRPM, p.limiterRPM,
      );
      if (auto !== this.autoGear) {
        this.autoGear = auto;
        this.sinceAutoShift = 0;
      }
      if (auto === 0 || this.manualIdle > MANUAL_HOLD_S) s.manualOffset = 0;
      const next = auto === 0 ? 0 : this.withinRevRange(clamp(auto + s.manualOffset, 1, gb.gearRatios.length), input.speed);
      if (auto > 0) s.manualOffset = next - auto;
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
        const slip = p.idleRPM + s.throttle * (gb.launchRPM - p.idleRPM);
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
        load = Math.max(load, 0.35 * Math.sin(t * Math.PI));
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
    const maxUp = MAX_RPM_RISE_PER_S * dt;
    const maxDown = MAX_RPM_FALL_PER_S * dt * (s.shifting ? 2 : 1);
    next = clamp(next, s.rpm - maxDown, s.rpm + maxUp);
    s.rpm = clamp(next, 0, p.limiterRPM + 150);
    s.load = clamp(load, 0, 1);
    return events;
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
