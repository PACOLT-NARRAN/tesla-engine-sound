import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsSchema, type Settings } from '../src/core/settings.ts';
import { FAVORITES_SCHEMA, RECENT_SCHEMA } from '../src/storage/engineLists.ts';
import { LocalStore, createMemoryBackend, type KeyValueBackend } from '../src/storage/storage.ts';

const DEFAULTS: Settings = {
  profileId: 'gt3flat6', volume: 0.8, units: 'kmh', demoScenarioId: 'full-cycle', demoNoise: false,
  demoNoCoordsSpeed: false, gearing: 'normal', shiftStyle: 'sport', theme: 'dark', language: null,
};
const schema = settingsSchema(DEFAULTS);

test('missing data gives defaults', () => {
  const r = new LocalStore(createMemoryBackend()).load(schema);
  assert.equal(r.outcome, 'missing');
  assert.deepEqual(r.value, DEFAULTS);
});

test('legacy (pre-versioning) settings object is migrated without losing values', () => {
  const legacy = { profileId: 'k20a', volume: 0.35, units: 'mph', demoScenarioId: 'city', demoNoise: true, demoNoCoordsSpeed: false, gearing: 'fun', shiftStyle: 'track', theme: 'light' };
  const r = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify(legacy) })).load(schema);
  assert.equal(r.outcome, 'migrated');
  assert.equal(r.storedVersion, 1);
  assert.deepEqual(r.value, { ...legacy, language: null });
});

test('saved settings round-trip in a versioned envelope', () => {
  const b = createMemoryBackend();
  const store = new LocalStore(b);
  const value: Settings = { ...DEFAULTS, language: 'cs', theme: 'light' };
  assert.ok(store.save(schema, value));
  const raw = JSON.parse(b.entries.get('revline.settings.v1') ?? 'null');
  assert.equal(raw.v, 2);
  const r = new LocalStore(b).load(schema);
  assert.equal(r.outcome, 'ok');
  assert.deepEqual(r.value, value);
});

for (const [name, text] of [
  ['broken JSON', '{"v":2,"data":{'],
  ['a number', '42'],
  ['null', 'null'],
  ['an array', '[1,2,3]'],
  ['a string', '"hello"'],
] as const) {
  test(`corrupted settings (${name}) never throw and fall back to defaults`, () => {
    const r = new LocalStore(createMemoryBackend({ 'revline.settings.v1': text })).load(schema);
    assert.deepEqual(r.value, DEFAULTS);
  });
}

test('invalid individual values are repaired, valid ones kept', () => {
  const data = { profileId: 7, volume: 'loud', units: 'furlongs', gearing: 'warp', shiftStyle: 'sport', theme: 'neon', language: 'de', demoNoise: 'yes' };
  const r = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 2, data }) })).load(schema);
  assert.deepEqual(r.value, DEFAULTS);
  const r2 = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 2, data: { volume: 7, language: 'cs' } }) })).load(schema);
  assert.equal(r2.value.volume, 1, 'clamped to 0..1');
  assert.equal(r2.value.language, 'cs');
  const r3 = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 2, data: { volume: Number.NaN } }) })).load(schema);
  assert.equal(r3.value.volume, DEFAULTS.volume);
});

test('data written by a newer build is not guessed at', () => {
  const r = new LocalStore(createMemoryBackend({ 'revline.settings.v1': JSON.stringify({ v: 99, data: { theme: 'light' } }) })).load(schema);
  assert.equal(r.outcome, 'future');
  assert.deepEqual(r.value, DEFAULTS);
});

test('a throwing or missing backend never crashes', () => {
  const broken: KeyValueBackend = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceeded'); },
    removeItem: () => { throw new Error('nope'); },
  };
  const s = new LocalStore(broken);
  assert.deepEqual(s.load(schema).value, DEFAULTS);
  assert.equal(s.save(schema, DEFAULTS), false);
  s.clearAll();
  const none = new LocalStore(null);
  assert.equal(none.load(schema).outcome, 'unavailable');
  assert.equal(none.save(schema, DEFAULTS), false);
});

test('id lists drop junk, duplicates and enforce limits', () => {
  const b = createMemoryBackend({
    'revline.favorites.v1': JSON.stringify({ v: 1, data: ['k20a', 'k20a', 'BAD ID', 5, null, 'lambov10'] }),
    'revline.recentEngines.v1': JSON.stringify({ v: 1, data: ['a', 'b', 'c', 'd', 'e'] }),
  });
  const s = new LocalStore(b);
  assert.deepEqual(s.load(FAVORITES_SCHEMA).value, ['k20a', 'lambov10']);
  assert.deepEqual(s.load(RECENT_SCHEMA).value, ['a', 'b', 'c']);
  assert.deepEqual(new LocalStore(createMemoryBackend({ 'revline.favorites.v1': '{oops' })).load(FAVORITES_SCHEMA).value, []);
});

test('clearAll removes the known keys and the load report records outcomes', () => {
  const b = createMemoryBackend({ 'revline.favorites.v1': JSON.stringify({ v: 1, data: ['k20a'] }), 'other.app': 'keep' });
  const s = new LocalStore(b);
  s.load(FAVORITES_SCHEMA);
  assert.equal(s.report.get('revline.favorites.v1')?.outcome, 'ok');
  s.clearAll();
  assert.equal(b.entries.has('revline.favorites.v1'), false);
  assert.equal(b.entries.get('other.app'), 'keep');
});
