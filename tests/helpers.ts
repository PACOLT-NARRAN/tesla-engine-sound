import type { EngineProfile } from '../src/types/profile.ts';
import type { RawFix } from '../src/types/motion.ts';
import { offsetNorth } from '../src/utils/geo.ts';

export function testProfile(over: Partial<EngineProfile> = {}): EngineProfile {
  return {
    id: 'test', name: 'Test V8', description: '', category: 'V8', aspiration: 'naturally-aspirated',
    cylinders: 8, displacementL: 5, source: { configLabel: 't', soundName: 't', awc: '', audioConfig: [] },
    idleRPM: 900, redlineRPM: 7500, limiterRPM: 7700,
    gearbox: {
      gearRatios: [3.13, 2.37, 1.83, 1.45, 1.17, 0.96, 0.78], finalDrive: 3.9, tireRadiusM: 0.345,
      shiftUpRPM: { gentle: 2600, hard: 7350 }, shiftDownRPM: { gentle: 1300, hard: 3800 },
      shiftDuration: 0.2, minShiftInterval: 0.9, launchRPM: 3600,
    },
    dynamics: { engineResponse: 0.09, throttleSensitivity: 1, fullThrottleAccel: 4.5 },
    audio: { converted: false, manifest: '', volume: 1, pitch: 1, overrunPops: 0, shiftBark: 0, placeholderTone: { brightness: 0.5, roughness: 0.5 } },
    ...over,
  };
}

/** Generates fixes along a straight line from a speed function. */
export function* track(opts: { hz: number; seconds: number; speedAt: (t: number) => number; withSpeed?: boolean; accuracy?: number; jitterM?: () => number }): Generator<RawFix> {
  let lat = 50;
  const lon = 14;
  const dt = 1 / opts.hz;
  for (let i = 0; i <= opts.seconds * opts.hz; i++) {
    const t = i * dt;
    const v = opts.speedAt(t);
    if (i > 0) lat = offsetNorth(lat, lon, v * dt).lat;
    const j = opts.jitterM ? offsetNorth(lat, lon, opts.jitterM()).lat : lat;
    yield {
      timestamp: 1_700_000_000_000 + Math.round(t * 1000),
      latitude: j, longitude: lon,
      accuracy: opts.accuracy ?? 5,
      speed: opts.withSpeed === false ? null : v,
      heading: 0,
    };
  }
}
