import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { soundRpm } from '../src/audio/layerMix.ts';
import { bankCacheKey } from '../src/audio/SoundBankLoader.ts';
import { superchargerHz } from '../src/audio/EngineAudioEngine.ts';
import { VirtualDrivetrain } from '../src/drivetrain/VirtualDrivetrain.ts';
import { canCreateCustomProfile, canUseCustomGearing, canUseEngine, resolveEntitlements } from '../src/entitlements/entitlements.ts';
import { buildItems, matchesFilter, queryGarage } from '../src/garage/garage.ts';
import { validateProfile } from '../src/profiles/schema.ts';
import { LocalStore, createMemoryBackend } from '../src/storage/storage.ts';
import {
  CUSTOM_ENGINES_SCHEMA, LIMITS, MAX_CUSTOM_ENGINES, buildCustomProfile, defaultSpec, duplicateSpec, generateRatios,
  newCustomId, parseDraft, parseNumber, sanitizeSpec, specFromProfile, speedAtRpm, toDraft, upsertSpec, validateSpec,
  type CustomEngineSpec,
} from '../src/studio/customEngine.ts';
import type { EngineProfile } from '../src/types/profile.ts';

const bank = (id: string): EngineProfile => validateProfile(JSON.parse(readFileSync(new URL(`../src/profiles/engines/${id}.json`, import.meta.url), 'utf8')), id);
const spec = (over: Partial<CustomEngineSpec> = {}): CustomEngineSpec => ({ ...defaultSpec(1_700_000_000_000, 'custom-test1'), name: 'MY V8', ...over });
const codes = (s: CustomEngineSpec) => validateSpec(s).map((i) => `${i.field}:${i.code}`);

test('the default spec (5.0 L twin-turbo V8, 8,500 RPM, 7 gears) is valid once named', () => {
  assert.deepEqual(codes(spec()), []);
  assert.deepEqual(codes({ ...spec(), name: '   ' }), ['name:required']);
});

test('numbers are parsed strictly; NaN, Infinity, negatives and out-of-range values are rejected', () => {
  assert.equal(parseNumber('5,0'), 5);
  assert.equal(parseNumber(' 8 500 '), 8500);
  for (const bad of ['', 'abc', '1e9', 'Infinity', 'NaN', '5..0', '--1']) assert.ok(Number.isNaN(parseNumber(bad)), bad);
  assert.deepEqual(codes(spec({ displacementL: Number.NaN })), ['displacementL:notNumber']);
  assert.deepEqual(codes(spec({ maxRPM: Number.POSITIVE_INFINITY })), ['maxRPM:notNumber']);
  assert.deepEqual(codes(spec({ displacementL: -2 })), ['displacementL:range']);
  assert.deepEqual(codes(spec({ maxRPM: 20000 })), ['maxRPM:range']);
  assert.deepEqual(codes(spec({ displacementL: 5.05 })), ['displacementL:decimals']);
});

test('idle must stay well below the max RPM', () => {
  assert.deepEqual(codes(spec({ idleRPM: 1500, maxRPM: 4000 })), ['idleRPM:revRange']);
  assert.deepEqual(codes(spec({ idleRPM: 1000, maxRPM: 4000 })), []);
});

test('cylinder count must fit the layout; rotary allows 2-4 rotors', () => {
  assert.deepEqual(codes(spec({ layout: 'V12', cylinders: 8 })), ['cylinders:cylinders']);
  assert.deepEqual(codes(spec({ layout: 'Rotary', cylinders: 3, displacementL: 2 })), []);
  assert.deepEqual(codes(spec({ layout: 'Rotary', cylinders: 5 })), ['cylinders:cylinders']);
});

test('custom gear ratios: count, range and strictly descending order are enforced', () => {
  assert.deepEqual(codes(spec({ gearCount: 4, customRatios: [3.5, 2.2, 1.5, 1.1] })), []);
  assert.deepEqual(codes(spec({ gearCount: 4, customRatios: [3.5, 2.2, 1.5] })), ['ratios:ratioCount']);
  assert.deepEqual(codes(spec({ gearCount: 4, customRatios: [3.5, 2.2, 2.2, 1.1] })), ['ratios:ratioOrder']);
  assert.deepEqual(codes(spec({ gearCount: 4, customRatios: [3.5, 2.2, 1.5, 0] })), ['ratios:ratioRange']);
  assert.deepEqual(codes(spec({ gearCount: 4, customRatios: [3.5, Number.NaN, 1.5, 1.1] })), ['ratios:notNumber']);
});

test('generated ratios are strictly descending for every allowed gear count', () => {
  for (let n = LIMITS.gearCount.min; n <= LIMITS.gearCount.max; n++) {
    const r = generateRatios(n);
    assert.equal(r.length, n);
    for (let i = 1; i < n; i++) assert.ok((r[i - 1] as number) - (r[i] as number) >= 0.049, `${n}: ${r.join(',')}`);
  }
});

test('a draft with typed text round-trips into the same spec', () => {
  const s = spec({ gearCount: 5, customRatios: [3.2, 2.1, 1.5, 1.15, 0.9] });
  const r = parseDraft(toDraft(s));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.spec, s);
  const broken = parseDraft({ ...toDraft(s), idleRPM: 'abc' });
  assert.equal(broken.spec, null);
  assert.deepEqual(broken.issues.map((i) => i.field), ['idleRPM']);
});

test('built profiles pass the engine profile validation and keep the spec', () => {
  for (const s of [spec(), spec({ layout: 'Inline-4', cylinders: 4, displacementL: 2, idleRPM: 900, maxRPM: 9000, induction: 'naturally-aspirated', gearCount: 6 })]) {
    const p = validateProfile(buildCustomProfile(s), s.id);
    assert.equal(p.redlineRPM, s.maxRPM);
    assert.equal(p.limiterRPM, s.maxRPM + 200);
    assert.equal(p.gearbox.gearRatios.length, s.gearCount);
    assert.equal(p.audio.converted, false, 'synth by default');
  }
});

test('borrowing a recorded bank maps the custom rev range onto the bank range', () => {
  const k20a = bank('k20a');
  const p = buildCustomProfile(spec({ sound: { kind: 'bank', bankId: 'k20a' }, idleRPM: 1000, maxRPM: 6800 }), k20a);
  assert.equal(p.audio.converted, true);
  assert.equal(p.audio.manifest, k20a.audio.manifest);
  assert.deepEqual(p.audio.bankRpm, { idle: k20a.idleRPM, limiter: k20a.limiterRPM });
  assert.equal(soundRpm(p.idleRPM, p), k20a.idleRPM);
  assert.equal(soundRpm(p.limiterRPM, p), k20a.limiterRPM);
  assert.equal(soundRpm(4000, k20a), 4000, 'built-in engines are unchanged');
  // Same recorded bank = same cache entry; synth banks are per engine and per tone.
  assert.equal(bankCacheKey(p), bankCacheKey(k20a));
  assert.notEqual(bankCacheKey(buildCustomProfile(spec())), bankCacheKey(buildCustomProfile(spec({ exhaust: 'stock' }))));
});

test('induction decides turbo / supercharger layers; exhaust and sliders change the sound', () => {
  const na = buildCustomProfile(spec({ induction: 'naturally-aspirated', turbo: 80, supercharger: 80 }));
  assert.equal(na.audio.turbo, 0);
  assert.equal(na.audio.supercharger, 0);
  const tc = buildCustomProfile(spec({ induction: 'twin-charged', turbo: 80, supercharger: 40 }));
  assert.equal(tc.audio.turbo, 0.8);
  assert.equal(tc.audio.supercharger, 0.4);
  assert.ok(buildCustomProfile(spec({ exhaust: 'race' })).audio.volume > buildCustomProfile(spec({ exhaust: 'stock' })).audio.volume);
  assert.ok((buildCustomProfile(spec({ overrun: 100 })).audio.offLoad ?? 0) > (buildCustomProfile(spec({ overrun: 0 })).audio.offLoad ?? 0));
  assert.equal(buildCustomProfile(spec({ crackle: 35 })).audio.overrunPops, 0.35);
  assert.ok(superchargerHz(7000) > superchargerHz(2000));
});

test('throttle response, engine braking and gearbox type change the drivetrain', () => {
  const fast = buildCustomProfile(spec({ throttleResponse: 200 }));
  const slow = buildCustomProfile(spec({ throttleResponse: 50 }));
  assert.ok(fast.dynamics.engineResponse < slow.dynamics.engineResponse);
  const brake = buildCustomProfile(spec({ engineBraking: 100 }));
  const coast = buildCustomProfile(spec({ engineBraking: 0 }));
  assert.ok(brake.gearbox.shiftDownRPM.gentle > coast.gearbox.shiftDownRPM.gentle);
  assert.ok(buildCustomProfile(spec({ gearboxType: 'dct' })).gearbox.shiftDuration < buildCustomProfile(spec({ gearboxType: 'automatic' })).gearbox.shiftDuration);
});

test('a custom engine drives through the normal drivetrain up to its own redline', () => {
  const p = buildCustomProfile(spec({ maxRPM: 7000 }));
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  let maxRpm = 0;
  for (let i = 0; i < 1500; i++) {
    const t = i * 0.02;
    dt.update(0.02, { speed: Math.min(60, t * 5), accel: 5, stationary: false });
    maxRpm = Math.max(maxRpm, dt.state.rpm);
  }
  assert.ok(maxRpm > 5000 && maxRpm <= p.limiterRPM + 1, `max ${maxRpm}`);
  assert.ok(dt.state.gear > 2);
});

test('speedAtRpm: top speed per gear grows with each gear', () => {
  const p = buildCustomProfile(spec());
  const v = p.gearbox.gearRatios.map((r) => speedAtRpm(p.redlineRPM, r, p.gearbox.finalDrive) * 3.6);
  for (let i = 1; i < v.length; i++) assert.ok((v[i] as number) > (v[i - 1] as number));
  assert.ok((v[0] as number) > 40 && (v[0] as number) < 120, `1st gear ${v[0]}`);
});

test('ids, duplicate and "use as base" from every built-in engine', () => {
  const id = newCustomId(1_700_000_000_000, () => 0.5);
  assert.match(id, /^custom-[a-z0-9]+$/);
  const copy = duplicateSpec(spec(), 'COPY', 5);
  assert.notEqual(copy.id, 'custom-test1');
  assert.equal(copy.name, 'COPY');
  assert.equal(copy.createdAt, 5);
  for (const b of ['k20a', 'gt3flat6', 'rotary7', 'f50v12', 'brabus850', 'musv8', 'p60b40']) {
    const s = specFromProfile(bank(b), 'MY ' + b);
    assert.deepEqual(validateSpec(s), [], b);
  }
});

test('storage: corrupted, invalid and duplicate custom engines are dropped, valid ones kept', () => {
  const good = spec();
  const data = [good, good, { ...good, id: 'custom-two', maxRPM: 'fast' }, { id: 'evil<script>' }, 42, null, { ...good, id: 'custom-three', layout: 'W16' }];
  const r = new LocalStore(createMemoryBackend({ [CUSTOM_ENGINES_SCHEMA.key]: JSON.stringify({ v: 1, data }) })).load(CUSTOM_ENGINES_SCHEMA);
  assert.deepEqual(r.value.map((s) => s.id), ['custom-test1', 'custom-three']);
  assert.equal(r.value[1]?.layout, 'V8', 'unknown enum repaired to default');
  assert.deepEqual(new LocalStore(createMemoryBackend({ [CUSTOM_ENGINES_SCHEMA.key]: '{oops' })).load(CUSTOM_ENGINES_SCHEMA).value, []);
  assert.equal(sanitizeSpec({ ...good, customRatios: [1, 2, 3] }), null, 'ratio count mismatch is not guessed');
  const many = Array.from({ length: MAX_CUSTOM_ENGINES + 5 }, (_, i) => ({ ...good, id: `custom-n${i}` }));
  assert.equal(CUSTOM_ENGINES_SCHEMA.sanitize(many, []).length, MAX_CUSTOM_ENGINES);
});

test('upsert replaces by id and appends new engines', () => {
  const a = spec();
  const b = spec({ id: 'custom-b' });
  assert.deepEqual(upsertSpec([a], b).map((s) => s.id), ['custom-test1', 'custom-b']);
  assert.equal(upsertSpec([a, b], { ...a, name: 'NEW' })[0]?.name, 'NEW');
});

test('entitlements: Studio save, own ratios and driving custom engines are PRO; built-ins stay free', () => {
  const free = resolveEntitlements('free');
  const pro = resolveEntitlements('pro');
  assert.equal(canCreateCustomProfile(free), false);
  assert.equal(canUseCustomGearing(free), false);
  assert.equal(canUseEngine(free, { custom: true }), false);
  assert.equal(canUseEngine(free, { custom: false }), true);
  assert.equal(canCreateCustomProfile(pro), true);
  assert.equal(canUseEngine(pro, { custom: true }), true);
  assert.equal(canCreateCustomProfile(resolveEntitlements('auto')), true, 'early access unlocks everything');
});

test('Garage lists custom engines under the Custom filter, after the built-in engines', () => {
  const items = buildItems([buildCustomProfile(spec()), bank('k20a')], () => undefined);
  assert.deepEqual(items.map((i) => i.custom), [true, false]);
  assert.ok(matchesFilter(items[0]!, 'custom', { favorites: [], recent: [] }));
  assert.ok(!matchesFilter(items[1]!, 'custom', { favorites: [], recent: [] }));
  const sorted = queryGarage(items, { filter: 'all', query: '', sort: 'recommended' }, { favorites: [], recent: [] }, () => '', 'en');
  assert.deepEqual(sorted.map((i) => i.custom), [false, true]);
});
