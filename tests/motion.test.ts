import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionEstimator } from '../src/motion/MotionEstimator.ts';
import { createRng } from '../src/utils/math.ts';
import { track } from './helpers.ts';

const lastTs = (fixes: { timestamp: number }[]) => (fixes[fixes.length - 1] as { timestamp: number }).timestamp;

test('uses coords.speed when the browser provides it', () => {
  const est = new MotionEstimator();
  const fixes = [...track({ hz: 1, seconds: 6, speedAt: () => 15 })];
  for (const f of fixes) est.ingest(f);
  const s = est.sample(lastTs(fixes));
  assert.equal(s.raw.speedSource, 'coords');
  assert.ok(Math.abs(s.speed - 15) < 0.3, `speed ${s.speed}`);
});

test('falls back to Haversine speed when coords.speed is null', () => {
  const est = new MotionEstimator();
  const fixes = [...track({ hz: 1, seconds: 10, speedAt: () => 20, withSpeed: false })];
  for (const f of fixes) est.ingest(f);
  const s = est.sample(lastTs(fixes));
  assert.equal(s.raw.speedSource, 'haversine');
  assert.ok(Math.abs(s.speed - 20) < 0.6, `speed ${s.speed}`);
});

test('rejects invalid, inaccurate, out-of-order and impossible fixes without crashing', () => {
  const est = new MotionEstimator();
  const base = { latitude: 50, longitude: 14, accuracy: 5, speed: 10, heading: null };
  assert.equal(est.ingest({ ...base, timestamp: 1000 }).accepted, true);
  assert.deepEqual(est.ingest({ ...base, timestamp: 2000, latitude: NaN }), { accepted: false, reason: 'invalid' });
  assert.deepEqual(est.ingest({ ...base, timestamp: 2000, accuracy: 500 }), { accepted: false, reason: 'low-accuracy' });
  assert.deepEqual(est.ingest({ ...base, timestamp: 500 }), { accepted: false, reason: 'out-of-order' });
  assert.deepEqual(est.ingest({ ...base, timestamp: 3000, speed: 400 }), { accepted: false, reason: 'speed-outlier' });
  assert.deepEqual(est.ingest({ ...base, timestamp: 3000, speed: 40 }), { accepted: false, reason: 'accel-outlier' });
  const s = est.sample(3000);
  assert.ok(s.speed > 8 && s.speed < 13, `speed stayed plausible: ${s.speed}`);
  assert.equal(s.rejectedFixes, 5);
});

test('filter smooths noisy speed (lower variance than raw)', () => {
  const est = new MotionEstimator();
  const rng = createRng(42);
  const raw: number[] = [];
  const filt: number[] = [];
  for (const f of track({ hz: 1, seconds: 60, speedAt: () => 25 })) {
    const noisy = { ...f, speed: 25 + (rng() - 0.5) * 4 };
    est.ingest(noisy);
    raw.push(noisy.speed);
    filt.push(est.sample(f.timestamp).speed);
  }
  const variance = (a: number[]) => {
    const t = a.slice(10);
    const m = t.reduce((x, y) => x + y, 0) / t.length;
    return t.reduce((x, y) => x + (y - m) ** 2, 0) / t.length;
  };
  assert.ok(variance(filt) < variance(raw) * 0.7, `filtered ${variance(filt)} raw ${variance(raw)}`);
});

test('stationary jitter is suppressed to zero speed', () => {
  const est = new MotionEstimator();
  const rng = createRng(7);
  // Parked: coordinates wander ±2 m with a 6 m accuracy and no coords.speed.
  const fixes = [...track({ hz: 1, seconds: 30, speedAt: () => 0, withSpeed: false, accuracy: 6, jitterM: () => (rng() - 0.5) * 4 })];
  let maxSpeed = 0;
  for (const f of fixes) {
    est.ingest(f);
    maxSpeed = Math.max(maxSpeed, est.sample(f.timestamp).speed);
  }
  const s = est.sample(lastTs(fixes));
  assert.equal(s.stationary, true);
  assert.equal(s.speed, 0);
  assert.ok(maxSpeed < 1.0, `max speed while parked ${maxSpeed}`);
});

test('stationary hysteresis: leaves standstill once really moving', () => {
  const est = new MotionEstimator();
  const fixes = [...track({ hz: 1, seconds: 8, speedAt: (t) => (t < 3 ? 0 : 2 * (t - 3)) })];
  for (const f of fixes) est.ingest(f);
  const s = est.sample(lastTs(fixes));
  assert.equal(s.stationary, false);
  assert.ok(s.speed > 6, `speed ${s.speed}`);
});

test('acceleration is estimated from a speed ramp', () => {
  const est = new MotionEstimator();
  const fixes = [...track({ hz: 1, seconds: 15, speedAt: (t) => 2 * t })];
  for (const f of fixes) est.ingest(f);
  const s = est.sample(lastTs(fixes));
  assert.ok(Math.abs(s.accel - 2) < 0.35, `accel ${s.accel}`);
});

test('deceleration is negative', () => {
  const est = new MotionEstimator();
  const fixes = [...track({ hz: 1, seconds: 8, speedAt: (t) => Math.max(0, 30 - 2.5 * t) })];
  for (const f of fixes) est.ingest(f);
  const s = est.sample(lastTs(fixes));
  assert.ok(s.accel < -1.8, `accel ${s.accel}`);
});

test('GPS dropout: becomes stale then lost and stops extrapolating acceleration', () => {
  const est = new MotionEstimator();
  const fixes = [...track({ hz: 1, seconds: 5, speedAt: (t) => 10 + t })];
  for (const f of fixes) est.ingest(f);
  const t = lastTs(fixes);
  assert.equal(est.sample(t + 4000).quality, 'stale');
  assert.equal(est.sample(t + 4000).accel, 0);
  assert.equal(est.sample(t + 12000).quality, 'lost');
  assert.ok(est.sample(t + 12000).speed < 20, 'no runaway prediction');
});

test('GPS fixes stamped by a different clock use their arrival time (no false "signal lost")', async () => {
  const { fixTimestamp } = await import('../src/motion/GeolocationMotionSource.ts');
  const now = 1_800_000_000_000;
  assert.equal(fixTimestamp(now - 300, now), now - 300);
  assert.equal(fixTimestamp(now - 18_000, now), now, 'GPS-time offset');
  assert.equal(fixTimestamp(now + 3_600_000, now), now, 'timezone-skewed clock');
  assert.equal(fixTimestamp(0, now), now);
});
