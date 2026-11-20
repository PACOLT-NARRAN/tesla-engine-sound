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

  constructor(profile: EngineProfile) {
    this.profile = profile;
    this.s = {
      speed: 0, accel: 0, throttle: 0, load: 0, rpm: 0, targetRpm: 0, gear: 0,
      shifting: false, shiftDirection: null, shiftProgress: 0, overrun: false, limiter: false, running: false,
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
    this.s.throttle = 0;
    this.s.load = 0;
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
    if (s.overrun && !this.wasOverrun) events.push({ type: 'overrun-start', rpm: s.rpm });
    this.wasOverrun = s.overrun;

    // 2) Gear selection (blocked while a shift is in progress).
    this.sinceShift += dt;
    if (!s.shifting) {
      const next = selectGear(
        { currentGear: s.gear, speedMs: input.speed, throttle: this.shiftThrottle, sinceLastShift: this.sinceShift, stationary: input.stationary, overrun: s.overrun },
        gb, p.idleRPM, p.limiterRPM,
      );
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
}
