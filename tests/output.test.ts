import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_CEILING, OUTPUT_TUNING, outputGains, softClipCurve } from '../src/audio/outputStage.ts';
import { settingsSchema, type Settings } from '../src/core/settings.ts';
import { LocalStore, createMemoryBackend } from '../src/storage/storage.ts';

test('output stage: louder drive, VOLUME BOOST adds more, bass maps to shelf + sub peak', () => {
  const normal = outputGains({ volume: 0.8, boost: false, bass: 0 });
  assert.equal(normal.master, 0.8);
  assert.ok(normal.drive > 1, 'drives the limiter at normal volume');
  const boosted = outputGains({ volume: 0.8, boost: true, bass: 0 });
  assert.equal(boosted.drive, normal.drive * OUTPUT_TUNING.boostDrive);
  assert.equal(normal.shelfDb, 0);
  const bass = outputGains({ volume: 1, boost: false, bass: 1 });
  assert.equal(bass.shelfDb, OUTPUT_TUNING.shelfMaxDb);
  assert.equal(bass.subDb, OUTPUT_TUNING.subMaxDb);
  const bad = outputGains({ volume: Number.NaN, boost: false, bass: 7 });
  assert.equal(bad.master, 0);
  assert.equal(bad.shelfDb, OUTPUT_TUNING.shelfMaxDb);
});

test('soft clipper never exceeds the ceiling and is symmetric', () => {
  for (const k of [OUTPUT_TUNING.clip.normal, OUTPUT_TUNING.clip.boost]) {
    const c = softClipCurve(k);
    const max = Math.max(...Array.from(c, Math.abs));
    assert.ok(Math.abs(max - CLIP_CEILING) < 1e-6 && CLIP_CEILING < 1);
    assert.ok(Math.abs(c[(c.length - 1) / 2] ?? 1) < 1e-9, 'silence stays silent');
    assert.ok(Math.abs((c[0] ?? 0) + (c[c.length - 1] ?? 0)) < 1e-9);
  }
});

test('settings keep volume boost and bass boost; old stored settings get the defaults', () => {
  const d: Settings = {
    profileId: 'gt3flat6', volume: 0.8, volumeBoost: false, bassBoost: 0, units: 'kmh', demoScenarioId: 'full-cycle', demoNoise: false,
    demoNoCoordsSpeed: false, gearing: 'normal', shiftStyle: 'sport', transmission: 'auto', theme: 'dark', language: null,
  };
  const schema = settingsSchema(d);
  const old = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 3, data: { volume: 0.5 } }) })).load(schema).value;
  assert.equal(old.volumeBoost, false);
  assert.equal(old.bassBoost, 0);
  const saved = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 3, data: { volumeBoost: true, bassBoost: 0.6 } }) })).load(schema).value;
  assert.equal(saved.volumeBoost, true);
  assert.equal(saved.bassBoost, 0.6);
  const junk = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 3, data: { volumeBoost: 'yes', bassBoost: 9 } }) })).load(schema).value;
  assert.equal(junk.volumeBoost, false);
  assert.ok(junk.bassBoost >= 0 && junk.bassBoost <= 1);
});
