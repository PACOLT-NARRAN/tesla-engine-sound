import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MockMarketplaceApi, REMOTE_MARKETPLACE, MarketplaceError, packEngines, queryItems, type MockMode } from '../src/community/api.ts';
import {
  COMMUNITY_SCHEMA, canInstall, communityCustomId, engineState, forgetInstall, isCommunityEngineId, itemState, recordInstall,
  setRating, toCustomSpec, toggleFavorite, validatePublication, type CommunityLocal, type InstallContext,
} from '../src/community/install.ts';
import { MOCK_AUTHORS, MOCK_ENGINES, MOCK_ITEMS, MOCK_PACKS } from '../src/community/mockData.ts';
import { COMMUNITY_FORMAT, compareVersions, latestVersion, type CommunityEngine } from '../src/community/models.ts';
import { LocalStore, createMemoryBackend } from '../src/storage/storage.ts';
import { defaultSpec, sanitizeSpec, validateSpec } from '../src/studio/customEngine.ts';

const BANKS = new Set(['gt3flat6', 'k20a', 'avesv', 'brabus850', 'predatorv8', 'm297zonda', 'shonen']);
const eng = (id: string) => MOCK_ENGINES.find((e) => e.id === id) as CommunityEngine;
const ctx = (over: Partial<InstallContext> = {}): InstallContext => ({
  canSaveCustom: true, hasPro: true, bankLocked: () => false, banks: BANKS, customIds: new Set(), local: COMMUNITY_SCHEMA.defaults(), ...over,
});
const installed = (local: CommunityLocal, ...items: CommunityEngine[]) => ({ local, customIds: new Set(items.map((i) => communityCustomId(i.id))) });

test('mock content is clearly demo: no ratings, no download counts, known authors, published', () => {
  const authors = new Set(MOCK_AUTHORS.map((a) => a.id));
  assert.ok(MOCK_ITEMS.length >= 8);
  for (const i of MOCK_ITEMS) {
    assert.equal(i.demo, true, i.id);
    assert.equal(i.rating, null, `${i.id} must not show fake ratings`);
    assert.equal(i.downloads, null, `${i.id} must not show fake downloads`);
    assert.ok(authors.has(i.authorId), i.id);
    assert.ok(i.summary.en && i.summary.cs, i.id);
    assert.ok(i.versions.length > 0);
  }
  assert.ok(MOCK_AUTHORS.every((a) => a.demo));
  assert.equal(new Set(MOCK_ITEMS.map((i) => i.id)).size, MOCK_ITEMS.length, 'unique ids');
  for (const p of MOCK_PACKS) assert.equal(packEngines(p, MOCK_ITEMS).length, p.engineIds.length, `${p.id} engines exist`);
});

test('every mock engine is a valid Sound Studio engine on a project-owned bank', () => {
  const banks = new Set(JSON.parse(JSON.stringify([...BANKS])) as string[]);
  for (const e of MOCK_ENGINES) {
    const spec = toCustomSpec(e, 'cs', 1);
    assert.deepEqual(validateSpec(spec, banks), [], e.id);
    assert.ok(sanitizeSpec(JSON.parse(JSON.stringify(spec))), `${e.id} survives storage`);
    assert.equal(e.soundOrigin, 'project-bank');
    assert.equal(e.ownershipConfirmed, false, 'project-owned audio needs no ownership confirmation');
    assert.equal(spec.description, e.summary.cs.slice(0, 200));
  }
});

test('community ids map to valid custom ids and are recognisable', () => {
  const id = communityCustomId('cm-alpine-flat6');
  assert.equal(id, 'custom-cmcmalpineflat6');
  assert.match(id, /^custom-[a-z0-9]{1,40}$/);
  assert.ok(isCommunityEngineId(id));
  assert.ok(!isCommunityEngineId(defaultSpec(1, 'custom-abc').id));
  assert.ok(communityCustomId('x'.repeat(100)).length <= 47);
});

test('versions compare numerically', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.9', '1'), -1);
  assert.equal(latestVersion(eng('cm-alpine-flat6')), '1.1.0');
});

test('installation status: not installed → installed → update available; deleted from Garage = not installed', () => {
  const alpine = eng('cm-alpine-flat6');
  assert.equal(engineState(alpine, ctx()).status, 'not-installed');
  const local = recordInstall(COMMUNITY_SCHEMA.defaults(), alpine, 5);
  assert.deepEqual(engineState(alpine, ctx(installed(local, alpine))), { status: 'installed', installedVersion: '1.1.0' });
  const old = { ...local, installed: { [alpine.id]: { version: '1.0.0', installedAt: 1 } } };
  const st = engineState(alpine, ctx(installed(old, alpine)));
  assert.equal(st.status, 'update-available');
  assert.ok(canInstall(st));
  // Record exists but the user deleted the engine in the Garage.
  assert.equal(engineState(alpine, ctx({ local })).status, 'not-installed');
  assert.equal(forgetInstall(local, alpine.id).installed[alpine.id], undefined);
});

test('locks: FREE plan, PRO-only items, locked sound banks; incompatible format and missing banks', () => {
  assert.deepEqual(engineState(eng('cm-hothatch-i4'), ctx({ canSaveCustom: false, hasPro: false })), { status: 'locked', installedVersion: null, lock: 'pro' });
  assert.equal(engineState(eng('cm-boulevard-v8'), ctx({ hasPro: false })).lock, 'pro');
  assert.equal(engineState(eng('cm-boulevard-v8'), ctx()).status, 'not-installed');
  assert.equal(engineState(eng('cm-hyper-v12'), ctx({ bankLocked: (b) => b === 'm297zonda' })).lock, 'bank-locked');
  assert.deepEqual(engineState(eng('cm-future-format'), ctx()), { status: 'incompatible', installedVersion: null, incompatible: 'format' });
  assert.ok(eng('cm-future-format').compatibility.format > COMMUNITY_FORMAT);
  assert.equal(engineState(eng('cm-hothatch-i4'), ctx({ banks: new Set(['gt3flat6']) })).incompatible, 'bank-missing');
  assert.ok(!canInstall(engineState(eng('cm-future-format'), ctx())));
});

test('packs: paid packs stay locked, free packs install all engines, status follows the engines', () => {
  const night = MOCK_PACKS.find((p) => p.id === 'cmp-night-cruise')!;
  const track = MOCK_PACKS.find((p) => p.id === 'cmp-track-day')!;
  assert.deepEqual(itemState(night, MOCK_ITEMS, ctx()), { status: 'locked', installedVersion: null, lock: 'paid' });
  assert.equal(itemState(track, MOCK_ITEMS, ctx()).status, 'not-installed');
  const engines = packEngines(track, MOCK_ITEMS);
  let local = COMMUNITY_SCHEMA.defaults();
  for (const e of engines) local = recordInstall(local, e, 1);
  assert.equal(itemState(track, MOCK_ITEMS, ctx(installed(local, ...engines))).status, 'installed');
  // Only one engine installed: the rest can still be added.
  const one = recordInstall(COMMUNITY_SCHEMA.defaults(), engines[0]!, 1);
  assert.equal(itemState(track, MOCK_ITEMS, ctx(installed(one, engines[0]!))).status, 'not-installed');
  // An older version of one engine → the pack offers the update.
  const older = { ...local, installed: { ...local.installed, 'cm-alpine-flat6': { version: '1.0.0', installedAt: 1 } } };
  assert.equal(itemState(track, MOCK_ITEMS, ctx(installed(older, ...engines))).status, 'update-available');
  assert.equal(itemState(track, MOCK_ITEMS, ctx({ canSaveCustom: false, hasPro: false })).lock, 'pro');
});

test('local community data: favorites, 1–5 star ratings, schema sanitising', () => {
  let l = COMMUNITY_SCHEMA.defaults();
  l = toggleFavorite(l, 'cm-alpine-flat6');
  assert.deepEqual(l.favorites, ['cm-alpine-flat6']);
  assert.deepEqual(toggleFavorite(l, 'cm-alpine-flat6').favorites, []);
  l = setRating(l, 'cm-alpine-flat6', 4);
  assert.equal(l.ratings['cm-alpine-flat6'], 4);
  assert.equal(setRating(l, 'cm-alpine-flat6', null).ratings['cm-alpine-flat6'], undefined);
  assert.equal(setRating(l, 'x', 9).ratings.x, undefined);

  const store = new LocalStore(createMemoryBackend({
    'revline.community.v1': JSON.stringify({ v: 1, data: {
      installed: { 'cm-a': { version: '1.0.0', installedAt: 3 }, 'BAD ID': { version: '1' }, 'cm-b': { version: 'abc' } },
      favorites: ['cm-a', 'cm-a', 5, 'Bad Id'], ratings: { 'cm-a': 5, 'cm-b': 0, 'cm-c': 2.5 },
    } }),
  }));
  const r = store.load(COMMUNITY_SCHEMA);
  assert.deepEqual(r.value, { installed: { 'cm-a': { version: '1.0.0', installedAt: 3 } }, favorites: ['cm-a'], ratings: { 'cm-a': 5 } });
  const broken = new LocalStore(createMemoryBackend({ 'revline.community.v1': '{oops' })).load(COMMUNITY_SCHEMA);
  assert.equal(broken.outcome, 'corrupt');
  assert.deepEqual(broken.value, COMMUNITY_SCHEMA.defaults());
});

test('search and filters', () => {
  const authors = new Map(MOCK_AUTHORS.map((a) => [a.id, a]));
  const base = { authors, favorites: [] as string[], isInstalled: () => false };
  const q = (filter: Parameters<typeof queryItems>[1]['filter'], search = '') => queryItems(MOCK_ITEMS, { filter, search }, base).map((i) => i.id);
  assert.equal(q('all').length, MOCK_ITEMS.length);
  assert.ok(q('pack').every((id) => id.startsWith('cmp-')));
  assert.ok(q('engine').every((id) => id.startsWith('cm-')));
  assert.deepEqual(q('all', 'kompresoru'), ['cm-street-sc-v8'], 'Czech text is searchable');
  assert.ok(q('all', 'night garage').includes('cm-boulevard-v8'), 'author is searchable');
  assert.deepEqual(q('all', 'boxer'), ['cm-alpine-flat6']);
  assert.deepEqual(q('installed'), []);
  assert.deepEqual(queryItems(MOCK_ITEMS, { filter: 'favorites', search: '' }, { ...base, favorites: ['cmp-track-day'] }).map((i) => i.id), ['cmp-track-day']);
  const hidden = [{ ...MOCK_ENGINES[0]!, publication: 'taken-down' as const }];
  assert.deepEqual(queryItems(hidden, { filter: 'all', search: '' }, base), []);
});

test('mock API: every simulated state; reports and publishing are never sent', async () => {
  let mode: MockMode = 'normal';
  const api = new MockMarketplaceApi(() => mode, () => Promise.resolve());
  const ok = await api.list();
  assert.equal(ok.source, 'mock');
  assert.equal(ok.items.length, MOCK_ITEMS.length);
  ok.items[0]!.title = 'CHANGED';
  assert.notEqual(MOCK_ITEMS[0]!.title, 'CHANGED', 'callers get copies');
  mode = 'empty';
  assert.equal((await api.list()).items.length, 0);
  mode = 'error';
  await assert.rejects(api.list(), (e: unknown) => e instanceof MarketplaceError && e.code === 'server');
  mode = 'offline';
  await assert.rejects(api.list(), (e: unknown) => e instanceof MarketplaceError && e.code === 'offline');
  assert.deepEqual(await api.report(), { sent: false, reason: 'not-available' });
  assert.deepEqual(await api.publish(), { sent: false, reason: 'not-available' });
  assert.equal(REMOTE_MARKETPLACE, null);
});

test('publication checks; the ownership confirmation is only for user recordings', () => {
  const spec = { ...defaultSpec(1, 'custom-mine1'), name: 'MY V8', sound: { kind: 'bank' as const, bankId: 'k20a' } };
  const draft = { description: 'A loud V8 for night cruising in the city.', tags: ['v8'], ownershipConfirmed: false };
  assert.deepEqual(validatePublication(spec, draft), []);
  assert.deepEqual(validatePublication(spec, { ...draft, description: 'short' }), ['description']);
  assert.deepEqual(validatePublication(spec, { ...draft, tags: [] }), ['tags']);
  assert.deepEqual(validatePublication(spec, { ...draft, tags: ['a', 'b', 'c', 'd'] }), ['tooManyTags']);
  assert.deepEqual(validatePublication(spec, draft, 'user-recording'), ['ownership']);
  assert.deepEqual(validatePublication(spec, { ...draft, ownershipConfirmed: true }, 'user-recording'), []);
  assert.deepEqual(validatePublication({ ...spec, id: communityCustomId('cm-x') }, draft), ['communityCopy']);
  assert.deepEqual(validatePublication({ ...spec, maxRPM: 99999 }, draft), ['invalidEngine']);
});

test('community texts do not claim real ratings, downloads, publishing or purchases', async () => {
  const { en } = await import('../src/i18n/en.ts');
  assert.match(en['community.demoBanner'], /demo content/);
  assert.match(en['community.publish.notAvailable'], /Nothing was sent/);
  assert.match(en['community.report.notSent'], /Not sent/);
  const ui = readFileSync(new URL('../src/components/CommunityPanel.tsx', import.meta.url), 'utf8');
  assert.ok(!/fetch\(|localStorage|€|2\.99/.test(ui), 'no network, storage or literal prices in the UI');
});
