import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PREVIEW_REV_WINDOWS, PREVIEW_SECONDS, revPedalAt } from '../src/core/preview.ts';
import {
  GARAGE_FILTERS, buildItems, countByFilter, layoutGroup, matchesFilter, matchesQuery, normalizeText, queryGarage, searchText,
  type GarageItem, type GarageQuery,
} from '../src/garage/garage.ts';
import { searchLabels } from '../src/garage/labels.ts';
import { getCatalogEntry } from '../src/profiles/catalog.ts';
import { getPack } from '../src/profiles/packs.ts';
import { validateProfile } from '../src/profiles/schema.ts';
import type { EngineCatalogEntry } from '../src/types/catalog.ts';

const dir = new URL('../src/profiles/engines/', import.meta.url);
const profiles = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => validateProfile(JSON.parse(readFileSync(new URL(f, dir), 'utf8')), f));
const items = buildItems(profiles, getCatalogEntry);
const texts = new Map(items.map((i) => [i, searchText(i, searchLabels(i))]));
const ctx = { favorites: [] as string[], recent: [] as string[] };
const run = (q: Partial<GarageQuery>, c = ctx) =>
  queryGarage(items, { filter: 'all', query: '', sort: 'recommended', ...q }, c, (i) => texts.get(i) ?? '', 'en').map((i) => i.profile.id);

test('every built-in engine is a non-custom item with a marketing title and a valid tier / pack', () => {
  assert.equal(items.length, profiles.length);
  for (const i of items) {
    assert.ok(['free', 'pro', 'pack'].includes(i.tier));
    assert.equal(i.tier === 'pack', i.packId !== null, 'pack engines (and only they) name a pack');
    if (i.packId !== null) assert.ok(getPack(i.packId), `pack ${i.packId} exists`);
    assert.equal(i.custom, false);
    assert.notEqual(i.title, i.profile.id);
  }
});

test('layout groups cover V, inline, boxer and rotary', () => {
  const groups = new Set(items.map((i) => layoutGroup(i.profile)));
  for (const g of ['v', 'inline', 'boxer', 'rotary']) assert.ok(groups.has(g as never), `no ${g} engine`);
});

test('filters: induction and layout', () => {
  assert.ok(run({ filter: 'rotary' }).includes('rotary7'));
  assert.deepEqual(run({ filter: 'boxer' }), ['gt3flat6']);
  assert.ok(run({ filter: 'na' }).includes('lambov10'));
  assert.ok(!run({ filter: 'na' }).includes('rb26dett'));
  // Twin-charged counts as both turbo and supercharged.
  assert.ok(run({ filter: 'turbo' }).includes('musv8'));
  assert.ok(run({ filter: 'supercharged' }).includes('musv8'));
  assert.ok(run({ filter: 'supercharged' }).includes('predatorv8'));
  assert.ok(!run({ filter: 'turbo' }).includes('predatorv8'));
  assert.deepEqual(run({ filter: 'pro' }).sort(), ['f50v12', 'm158huayra', 'm297zonda', 'musv8', 'sestov10']);
  assert.deepEqual(run({ filter: 'pack' }).sort(), ['f40v8', 'lambov10', 'murciev12', 'rb26dett', 'rotary7', 'toysupmk4']);
  assert.equal(run({ filter: 'custom' }).length, 0);
  assert.equal(run({ filter: 'free' }).length, items.length - 11);
  assert.ok(run({ filter: 'free' }).includes('gt3flat6'), 'the default engine is FREE');
});

test('favorites and last used keep the user order', () => {
  const c = { favorites: ['k20a', 'lambov10'], recent: ['rotary7', 'k20a'] };
  assert.deepEqual(run({ filter: 'favorites' }, c), ['k20a', 'lambov10']);
  assert.deepEqual(run({ filter: 'recent' }, c), ['rotary7', 'k20a']);
  const counts = countByFilter(items, c);
  assert.equal(counts.favorites, 2);
  assert.equal(counts.all, items.length);
  assert.deepEqual(Object.keys(counts).sort(), [...GARAGE_FILTERS].sort());
});

test('search uses names, layouts, induction, tags and descriptions — in Czech and English', () => {
  assert.deepEqual(run({ query: 'flat-6 rs' }), ['gt3flat6']);
  assert.ok(run({ query: 'v12' }).length >= 6);
  assert.ok(run({ query: 'jdm' }).includes('rb26dett'));
  assert.ok(run({ query: 'boxer' }).includes('gt3flat6'));
  assert.ok(run({ query: 'wankel' }).includes('rotary7'));
  assert.ok(run({ query: 'kompresor' }).includes('predatorv8'), 'Czech induction word');
  assert.ok(run({ query: 'řadový' }).includes('k20a'), 'Czech with accents');
  assert.ok(run({ query: 'radove' }).includes('k20a'), 'Czech without accents');
  assert.ok(run({ query: 'italian v10' }).includes('lambov10'), 'words in any order');
  assert.ok(run({ query: 'twin turbo v12' }).includes('m158huayra'));
  assert.equal(run({ query: 'zzzz' }).length, 0);
});

test('search does not rely on internal bank ids', () => {
  assert.ok(!texts.get(items.find((i) => i.profile.id === 'm158huayra') as GarageItem)?.includes('m158huayra'));
  assert.equal(run({ query: 'murciev12' }).length, 0);
});

test('sorting', () => {
  const byRpm = run({ sort: 'rpm' });
  const rpm = (id: string) => profiles.find((p) => p.id === id)?.redlineRPM ?? 0;
  for (let i = 1; i < byRpm.length; i++) assert.ok(rpm(byRpm[i - 1] as string) >= rpm(byRpm[i] as string));
  const byName = queryGarage(items, { filter: 'all', query: '', sort: 'name' }, ctx, () => '', 'en').map((i) => i.title);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b, 'en')));
});

test('normalizeText and matchesQuery', () => {
  assert.equal(normalizeText('  Přeplňovaný   V8 '), 'preplnovany v8');
  assert.ok(matchesQuery('italian v12 hypercar', 'V12  italian'));
  assert.ok(matchesQuery('anything', '   '));
});

test('PRO and pack engines are recognised once metadata says so', () => {
  const meta = getCatalogEntry('k20a') as EngineCatalogEntry;
  const p = profiles.find((x) => x.id === 'k20a');
  assert.ok(p);
  const [pro] = buildItems([p], () => ({ ...meta, tier: 'pro' }));
  const [pack] = buildItems([p], () => ({ ...meta, tier: 'pack', packId: 'jdm-legends' }));
  assert.ok(pro && matchesFilter(pro, 'pro', ctx) && !matchesFilter(pro, 'free', ctx));
  assert.ok(pack && matchesFilter(pack, 'pack', ctx));
  assert.equal(getPack('jdm-legends')?.name.en, 'JDM LEGENDS');
  assert.equal(getPack('nope'), undefined);
  assert.equal(getPack(null), undefined);
});

test('preview script revs inside its windows and ends', () => {
  assert.equal(revPedalAt(0.5), false);
  assert.equal(revPedalAt(1.1), true);
  assert.equal(revPedalAt(3), true);
  assert.equal(revPedalAt(4), false);
  for (const [a, b] of PREVIEW_REV_WINDOWS) assert.ok(a < b && b <= PREVIEW_SECONDS);
});

test('preview script really revs a standing engine and lets it fall back', async () => {
  const { VirtualDrivetrain } = await import('../src/drivetrain/VirtualDrivetrain.ts');
  const p = profiles.find((x) => x.id === 'gt3flat6');
  assert.ok(p);
  const dt = new VirtualDrivetrain(p);
  dt.ignite();
  let peak = 0;
  let end = 0;
  for (let t = 0; t < PREVIEW_SECONDS; t += 0.02) {
    dt.setRevPedal(revPedalAt(t));
    dt.update(0.02, { speed: 0, accel: 0, stationary: true });
    if (t > 2 && t < 3.6) peak = Math.max(peak, dt.state.rpm);
    end = dt.state.rpm;
  }
  assert.ok(peak > p.redlineRPM * 0.7, `peak ${Math.round(peak)}`);
  assert.ok(end < p.idleRPM * 1.5, `end ${Math.round(end)}`);
  assert.ok(peak <= p.limiterRPM + 150);
});
