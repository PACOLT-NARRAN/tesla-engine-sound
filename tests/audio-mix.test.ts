import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandPlaybackRate, bandWeights, loadGains } from '../src/audio/layerMix.ts';
import { synthesizeEngineLoop } from '../src/audio/placeholder/synthEngine.ts';

const bands = [1000, 2000, 4000, 8000];

test('band weights are equal-power and only two bands are active', () => {
  const w: number[] = [];
  for (const rpm of [800, 1000, 1500, 3000, 5000, 9000]) {
    bandWeights(rpm, bands, w);
    const power = w.reduce((s, x) => s + x * x, 0);
    assert.ok(Math.abs(power - 1) < 1e-9, `power ${power} at ${rpm}`);
    assert.ok(w.filter((x) => x > 1e-9).length <= 2);
  }
  bandWeights(2000, bands, w);
  assert.ok(Math.abs((w[1] as number) - 1) < 1e-9);
});

test('playback rate maps RPM relative to the band', () => {
  assert.equal(bandPlaybackRate(3000, 3000), 1);
  assert.ok(Math.abs(bandPlaybackRate(3300, 3000) - 1.1) < 1e-9);
});

test('overrun favours the off-load layer', () => {
  const g = loadGains(0, true);
  assert.ok(g.off > g.on);
  const full = loadGains(1, false);
  assert.ok(full.on > full.off);
});

test('placeholder loop is an exact number of engine cycles and is bounded', () => {
  const l = synthesizeEngineLoop({ rpm: 3000, cylinders: 8, load: 'on', sampleRate: 32000, brightness: 0.6, roughness: 0.5, forcedInduction: 'turbo', seed: 1 });
  const cycle = Math.round((120 / 3000) * 32000);
  assert.equal(l.data.length % cycle, 0);
  assert.ok(Math.abs(l.rpm - 3000) < 5);
  let peak = 0;
  for (const v of l.data) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 1 && peak > 0.2);
  // Seam continuity: last->first sample step comparable to typical steps.
  const seam = Math.abs((l.data[0] as number) - (l.data[l.data.length - 1] as number));
  assert.ok(seam < 0.25, `seam jump ${seam}`);
});
