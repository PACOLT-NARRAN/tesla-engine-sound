import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeWav, encodeWav16 } from '../lib/wav.mjs';
import { extractLoop, flattenSweep, rpmForTime, timeForRpm, doubleLoop, logSpaced } from '../lib/loops.mjs';

test('WAV 16-bit round trip', () => {
  const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5);
  const { sampleRate, channels } = decodeWav(encodeWav16(x, 22050));
  assert.equal(sampleRate, 22050);
  assert.equal(channels[0].length, 1000);
  assert.ok(Math.abs(channels[0][123] - x[123]) < 1e-3);
});

test('extractLoop finds a whole number of cycles and a smooth seam', () => {
  const sr = 32000;
  const rpm = 3000;
  const f = rpm / 120; // engine-cycle frequency
  const x = Float32Array.from({ length: sr * 3 }, (_, i) => {
    const t = i / sr;
    return 0.5 * Math.sin(2 * Math.PI * f * 4 * t) + 0.3 * Math.sin(2 * Math.PI * f * 8 * t + 1) + 0.1 * Math.sin(2 * Math.PI * f * t);
  });
  const loop = extractLoop(x, sr, { centerS: 1.5, rpm, targetS: 0.4 });
  const cycle = (120 / rpm) * sr;
  const cycles = loop.length / cycle;
  assert.ok(Math.abs(cycles - Math.round(cycles)) < 0.02, `cycles ${cycles}`);
  assert.ok(loop.score > 0.99);
  const s = loop.samples;
  const seam = Math.abs(s[0] - s[s.length - 1]);
  let maxStep = 0;
  for (let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i] - s[i - 1]));
  assert.ok(seam <= maxStep * 1.05, `seam ${seam} vs max step ${maxStep}`);
});

test('timeForRpm maps a linear sweep and a custom curve', () => {
  assert.equal(timeForRpm(4500, { durationS: 10, rpmStart: 1000, rpmEnd: 8000 }), 5);
  assert.equal(timeForRpm(3000, { durationS: 10, rpmStart: 1000, rpmEnd: 8000, curve: [[0, 1000], [2, 3000], [10, 8000]] }), 2);
});

test('doubleLoop and logSpaced', () => {
  assert.equal(doubleLoop(new Float32Array(10)).length, 20);
  const b = logSpaced(1000, 8000, 4);
  assert.deepEqual(b, [1000, 2000, 4000, 8000]);
});

test('flattenSweep turns a steep RPM sweep into a cleanly loopable signal', () => {
  const sr = 32000;
  const model = { durationS: 6, rpmStart: 800, rpmEnd: 8000 };
  const x = new Float32Array(sr * 6);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    ph += rpmForTime(i / sr, model) / 120 / sr;
    x[i] = Math.sin(2 * Math.PI * ph * 4) + 0.4 * Math.sin(2 * Math.PI * ph * 8);
  }
  const rpm = 1200;
  const t = timeForRpm(rpm, model);
  const raw = extractLoop(x, sr, { centerS: t, rpm, targetS: 0.45 });
  const flat = flattenSweep(x, sr, { centerS: t, rpm, outS: 1.0, rpmAt: (tt) => rpmForTime(tt, model) });
  const fixed = extractLoop(flat, sr, { centerS: flat.length / sr / 2, rpm, targetS: 0.45 });
  assert.ok(raw.score < 0.9, `raw score ${raw.score}`);
  assert.ok(fixed.score > 0.98, `flattened score ${fixed.score}`);
});
