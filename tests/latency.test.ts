import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionEstimator, type MotionEstimatorConfig } from '../src/motion/MotionEstimator.ts';
import { VirtualDrivetrain } from '../src/drivetrain/VirtualDrivetrain.ts';
import { testProfile } from './helpers.ts';

/**
 * Lift-off latency: 1 Hz GPS fixes with Doppler speed, 70 km/h steady, then braking at 4 m/s²
 * starting at t = 10.3 s (between two fixes). Returns seconds from the start of braking until
 * the engine is off throttle (overrun or throttle < 0.05).
 */
function liftOffDelay(cfg: Partial<MotionEstimatorConfig> = {}): number {
  const est = new MotionEstimator(cfg);
  const dt = new VirtualDrivetrain(testProfile());
  dt.ignite();
  const brakeAt = 10.3;
  const v = (t: number) => Math.max(0, 19.4 - (t > brakeAt ? (t - brakeAt) * 4 : 0));
  let nextFix = 0;
  for (let t = 0; t < 16; t += 0.02) {
    if (t >= nextFix) {
      est.ingest({ timestamp: Math.round(t * 1000), latitude: 50 + t * 1e-4, longitude: 14, accuracy: 5, speed: v(t), heading: 0 });
      nextFix += 1;
    }
    dt.update(0.02, est.sample(Math.round(t * 1000)));
    if (t > brakeAt && (dt.state.overrun || dt.state.throttle < 0.05)) return t - brakeAt;
  }
  return Infinity;
}

/** Mean |estimated − true| speed (km/h) during the braking phase: how far the sound lags behind. */
function brakingLag(cfg: Partial<MotionEstimatorConfig> = {}): number {
  const est = new MotionEstimator(cfg);
  const brakeAt = 10.3;
  const v = (t: number) => Math.max(0, 19.4 - (t > brakeAt ? (t - brakeAt) * 4 : 0));
  let nextFix = 0, sum = 0, n = 0;
  for (let t = 0; t < 14.5; t += 0.02) {
    if (t >= nextFix) {
      est.ingest({ timestamp: Math.round(t * 1000), latitude: 50 + t * 1e-4, longitude: 14, accuracy: 5, speed: v(t), heading: 0 });
      nextFix += 1;
    }
    if (t > brakeAt + 1) { sum += Math.abs(est.sample(Math.round(t * 1000)).speed - v(t)) * 3.6; n++; }
  }
  return sum / n;
}

test('braking: the speed estimate follows the car much closer than the old filter tuning', () => {
  const now = brakingLag();
  const before = brakingLag({ alphaGood: 0.5, alphaPoor: 0.2, beta: 0.15, fastResponseGain: 0 });
  console.log(`braking lag: now ${now.toFixed(1)} km/h, old tuning ${before.toFixed(1)} km/h`);
  assert.ok(now < before * 0.6, `now ${now.toFixed(1)} km/h, old ${before.toFixed(1)} km/h`);
});

test('lift-off is heard on the first GPS fix after braking starts (≤ 1 fix interval + 0.3 s)', () => {
  const now = liftOffDelay();
  const before = liftOffDelay({ alphaGood: 0.5, alphaPoor: 0.2, beta: 0.15, fastResponseGain: 0 });
  assert.ok(now <= 1.0, `now ${now.toFixed(2)} s`);
  assert.ok(now <= before, `now ${now.toFixed(2)} s, old tuning ${before.toFixed(2)} s`);
});

// --- Random engine pool ------------------------------------------------------------------------
import { randomEnginePool } from '../src/core/randomEngine.ts';

test('random engine: only drivable engines, never the current one', () => {
  const pool = randomEnginePool(['a', 'b', 'c', 'd'], 'b', (id) => id !== 'd');
  assert.deepEqual(pool, ['a', 'c']);
  assert.deepEqual(randomEnginePool(['a'], 'a', () => true), []);
});
