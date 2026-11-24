import type { MotionSource, MotionSourceStatus, RawFix } from '../types/motion.ts';
import { offsetHeading, offsetNorth } from '../utils/geo.ts';
import { createCursor, stepScenario, type DemoScenario } from './demoScenarios.ts';

export interface DemoOptions {
  /** Fix rate in Hz. Real GPS is ~1 Hz; the demo defaults higher for a smooth showcase. */
  rateHz: number;
  /** Add realistic GPS noise to exercise the filter. */
  noise: boolean;
  /** Omit coords.speed so the Haversine fallback path is used. */
  withoutCoordsSpeed: boolean;
}

export const DEFAULT_DEMO_OPTIONS: DemoOptions = { rateHz: 10, noise: false, withoutCoordsSpeed: false };

/**
 * Synthesises position fixes from a scripted scenario. Feeds the SAME
 * MotionEstimator -> VirtualDrivetrain -> EngineAudioEngine chain as real GPS.
 */
export class DemoMotionSource implements MotionSource {
  readonly kind = 'demo' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly scenario: DemoScenario;
  private readonly opts: DemoOptions;

  constructor(scenario: DemoScenario, opts: Partial<DemoOptions> = {}) {
    this.scenario = scenario;
    this.opts = { ...DEFAULT_DEMO_OPTIONS, ...opts };
  }

  start(onFix: (fix: RawFix) => void, onStatus: (status: MotionSourceStatus) => void): void {
    this.stop();
    const cursor = createCursor();
    let lat = 50.0755;
    let lon = 14.4378;
    let last = Date.now();
    let heading = 0;
    let tRoad = 0;
    const period = 1000 / this.opts.rateHz;
    onStatus({ kind: 'active' });
    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const v = stepScenario(this.scenario, cursor, dt);
      // A gently winding road (left and right bends) so steering features can be heard.
      tRoad += dt;
      if (v > 3) heading = (heading + 22 * Math.sin(tRoad / 5) * dt + 360) % 360;
      const moved = offsetHeading(lat, lon, v * dt, heading);
      lat = moved.lat;
      lon = moved.lon;
      const n = this.opts.noise;
      const noisySpeed = n ? Math.max(0, v + gauss() * 0.35) : v;
      const posJitter = n ? offsetNorth(lat, lon, gauss() * 1.2) : { lat, lon };
      onFix({
        timestamp: now,
        latitude: posJitter.lat,
        longitude: posJitter.lon,
        accuracy: n ? 4 + Math.abs(gauss()) * 4 : 3,
        speed: this.opts.withoutCoordsSpeed ? null : noisySpeed,
        heading,
      });
    }, period);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}

function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
