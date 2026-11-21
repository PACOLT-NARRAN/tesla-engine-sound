import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACHIEVEMENTS_SCHEMA, ACHIEVEMENT_IDS, LOCAL_CHALLENGES, achievementViews, awardAchievements, collectionProgress, collections,
  eligibleAchievements, recentAchievements, type EngagementContext,
} from '../src/engagement/achievements.ts';
import { NAME_MAX, USER_PROFILE_SCHEMA, buildShareCard, cleanText, formatDuration, shareText } from '../src/engagement/profileCard.ts';
import {
  ENGINE_TRY_S, MAX_TICK_S, SESSION_MIN_S, STATISTICS_SCHEMA, StatsTracker, addActiveDay, currentStreak, dayKey,
  driveProfilesUsed, emptyStatistics, enginesTried, favoriteEngine, previousDay, sanitizeStatistics, type TickSample,
} from '../src/engagement/stats.ts';
import { translator } from '../src/i18n/index.ts';
import { ENGINE_CATALOG } from '../src/profiles/catalog.ts';
import { LocalStore, createMemoryBackend } from '../src/storage/storage.ts';

const T0 = new Date(2026, 10, 20, 10, 0, 0).getTime();
const sample = (over: Partial<TickSample> = {}): TickSample => ({
  mode: 'demo', transmission: 'auto', driveProfile: 'sport', engineId: 'gt3flat6', layout: 'boxer',
  speed: 10, quality: 'good', rpm: 3000, now: T0, ...over,
});
/** Drives `seconds` in 0.02 s ticks. */
function drive(tr: StatsTracker, seconds: number, over: Partial<TickSample> = {}) {
  const ms = [];
  for (let i = 0; i < Math.round(seconds / 0.02); i++) ms.push(...tr.tick(0.02, sample(over)));
  return ms;
}
const ctxOf = (stats = emptyStatistics(), over: Partial<EngagementContext> = {}): EngagementContext => ({
  stats, favorites: [], customCount: 0, catalog: ENGINE_CATALOG, today: dayKey(T0), ...over,
});

// --- Counting rules -------------------------------------------------------------------------

test('nothing counts without an ignition cycle', () => {
  const tr = new StatsTracker(emptyStatistics());
  assert.deepEqual(tr.tick(1, sample()), []);
  assert.equal(tr.stats.driveSeconds, 0);
});

test('idle / parked / revving in place adds no driving time (but top RPM is kept)', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  drive(tr, 120, { speed: 0, rpm: 8800 });
  drive(tr, 30, { speed: 1.0 }); // walking pace — not moving
  assert.equal(tr.stats.driveSeconds, 0);
  assert.equal(tr.stats.sessions, 0);
  assert.equal(tr.stats.maxRpm, 8800);
  assert.equal(tr.stats.ignitions, 1);
});

test('GPS time counts only with a usable signal', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  drive(tr, 10, { mode: 'gps', quality: 'lost' });
  drive(tr, 10, { mode: 'gps', quality: 'waiting' });
  drive(tr, 10, { mode: 'gps', quality: 'stale' });
  assert.equal(tr.stats.driveSeconds, 0);
  drive(tr, 10, { mode: 'gps', quality: 'poor' });
  drive(tr, 10, { mode: 'gps', quality: 'good' });
  assert.ok(Math.abs(tr.stats.gpsSeconds - 20) < 1e-6);
  assert.equal(tr.stats.demoSeconds, 0);
});

test('a long tick (background tab) adds at most MAX_TICK_S', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  tr.tick(30, sample());
  assert.equal(tr.stats.driveSeconds, MAX_TICK_S);
});

test('a session counts once per ignition cycle after SESSION_MIN_S, with its day', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  const before = drive(tr, SESSION_MIN_S - 1);
  assert.ok(!before.includes('session'));
  assert.equal(tr.stats.sessions, 0);
  const after = drive(tr, 2);
  assert.ok(after.includes('session'));
  drive(tr, 300);
  assert.equal(tr.stats.sessions, 1);
  assert.deepEqual(tr.stats.activeDays, [dayKey(T0)]);
  tr.endCycle();
  tr.startCycle();
  drive(tr, 61);
  assert.equal(tr.stats.sessions, 2);
  assert.equal(tr.stats.activeDays.length, 1, 'same day');
});

test('auto / manual and Drive Profile time, engines tried and layouts', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  drive(tr, ENGINE_TRY_S - 1, { engineId: 'k20a', layout: 'inline' });
  assert.deepEqual(enginesTried(tr.stats), []);
  const m = drive(tr, 2, { engineId: 'k20a', layout: 'inline', transmission: 'manual', driveProfile: 'track' });
  assert.ok(m.includes('engine-tried') && m.includes('layout'));
  assert.deepEqual(enginesTried(tr.stats), ['k20a']);
  assert.deepEqual(tr.stats.layoutsTried, ['inline']);
  assert.ok(tr.stats.manualSeconds > 1.9 && tr.stats.manualSeconds < 2.1);
  drive(tr, 31, { engineId: 'custom-x', layout: 'other' });
  assert.deepEqual(tr.stats.layoutsTried, ['inline'], 'unknown layouts do not count');
  assert.deepEqual(driveProfilesUsed(tr.stats), ['sport']);
});

test('manual Demo session challenge counts once per session', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  const m = drive(tr, 90, { transmission: 'manual' });
  assert.ok(m.includes('manual-demo'));
  drive(tr, 200, { transmission: 'manual' });
  assert.equal(tr.stats.manualDemoSessions, 1);
  tr.endCycle();
  tr.startCycle();
  drive(tr, 90, { transmission: 'manual', mode: 'gps' });
  assert.equal(tr.stats.manualDemoSessions, 1, 'GPS drives do not count');
});

// --- Days and streaks -----------------------------------------------------------------------

test('day keys and previous day across month and year boundaries', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  assert.equal(previousDay('2026-03-30'), '2026-03-29'); // after the EU DST switch
});

test('streak: consecutive days ending today or yesterday', () => {
  const days = ['2026-11-15', '2026-11-17', '2026-11-18', '2026-11-19'];
  assert.equal(currentStreak(days, '2026-11-19'), 3);
  assert.equal(currentStreak(days, '2026-11-20'), 3, 'still alive the next day');
  assert.equal(currentStreak(days, '2026-11-21'), 0);
  let s = emptyStatistics();
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05']) s = addActiveDay(s, d);
  assert.equal(s.bestStreak, 3);
  assert.equal(addActiveDay(s, '2026-11-05'), s, 'adding a known day is a no-op');
});

// --- Storage --------------------------------------------------------------------------------

test('statistics sanitise corrupted or hostile data', () => {
  const s = sanitizeStatistics({
    sessions: -5, driveSeconds: 'x', maxRpm: 1e9, engineSeconds: { k20a: 40, 'BAD ID': 99, gt3flat6: -1 },
    layoutsTried: ['v', 'v', 'hexagon'], activeDays: ['2026-11-20', 'yesterday', '2026-11-19', '2026-11-20'],
    driveProfileSeconds: { sport: 50, warp: 9 }, latitude: 50.1, route: [[1, 2]],
  });
  assert.equal(s.sessions, 0);
  assert.equal(s.driveSeconds, 0);
  assert.equal(s.maxRpm, 30000);
  assert.deepEqual(s.engineSeconds, { k20a: 40 });
  assert.deepEqual(s.layoutsTried, ['v']);
  assert.deepEqual(s.activeDays, ['2026-11-19', '2026-11-20']);
  assert.deepEqual(s.driveProfileSeconds, { comfort: 0, sport: 50, track: 0 });
  assert.ok(!('latitude' in s) && !('route' in s), 'unknown (location) fields are dropped');
});

test('statistics, achievements and profile round-trip through LocalStore; corrupt JSON falls back', () => {
  const backend = createMemoryBackend();
  const store = new LocalStore(backend);
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  drive(tr, 70);
  store.save(STATISTICS_SCHEMA, tr.stats);
  assert.equal(store.load(STATISTICS_SCHEMA).value.sessions, 1);
  backend.setItem(STATISTICS_SCHEMA.key, '{oops');
  const r = store.load(STATISTICS_SCHEMA);
  assert.equal(r.outcome, 'corrupt');
  assert.deepEqual(r.value, emptyStatistics());
  backend.setItem(ACHIEVEMENTS_SCHEMA.key, JSON.stringify({ v: 1, data: { unlocked: { 'first-ignition': 5, 'future-thing': 7, 'x y': 1, 'ten-sessions': 'no' } } }));
  assert.deepEqual(store.load(ACHIEVEMENTS_SCHEMA).value.unlocked, { 'first-ignition': 5, 'future-thing': 7 });
  backend.setItem(USER_PROFILE_SCHEMA.key, JSON.stringify({ v: 1, data: { displayName: '  Vojta\u0007  ', vehicle: 'x'.repeat(99) } }));
  const p = store.load(USER_PROFILE_SCHEMA).value;
  assert.equal(p.displayName, 'Vojta');
  assert.equal(p.vehicle.length, NAME_MAX);
});

// --- Achievements ---------------------------------------------------------------------------

test('achievement ids are stable and unique', () => {
  assert.deepEqual([...ACHIEVEMENT_IDS], [
    'first-ignition', 'five-engines', 'three-layouts', 'ten-sessions', 'seven-day-streak', 'manual-driver',
    'profile-explorer', 'garage-builder', 'studio-creator', 'jdm-collector', 'italian-collection',
  ]);
  assert.equal(achievementViews(ctxOf(), { unlocked: {} }).length, ACHIEVEMENT_IDS.length);
});

test('achievements are awarded once and never twice', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  let r = awardAchievements({ unlocked: {} }, ctxOf(tr.stats), 1000);
  assert.deepEqual(r.awarded, ['first-ignition']);
  const again = awardAchievements(r.state, ctxOf(tr.stats), 2000);
  assert.deepEqual(again.awarded, []);
  assert.equal(again.state, r.state, 'same object: nothing to save');
  assert.equal(again.state.unlocked['first-ignition'], 1000, 'original date kept');
  r = awardAchievements(r.state, ctxOf(tr.stats, { favorites: ['a', 'b', 'c', 'd', 'e'], customCount: 1 }), 3000);
  assert.deepEqual(r.awarded.sort(), ['garage-builder', 'studio-creator']);
  // Removing favorites later does not take the award away.
  assert.deepEqual(awardAchievements(r.state, ctxOf(tr.stats), 4000).awarded, []);
  assert.deepEqual(recentAchievements(r.state).slice(-1), ['first-ignition']);
});

test('collections and JDM / Italian achievements follow the catalog', () => {
  const japanese = ENGINE_CATALOG.filter((e) => e.origin === 'japanese').map((e) => e.id);
  const s = emptyStatistics();
  for (const id of japanese) s.engineSeconds[id] = ENGINE_TRY_S;
  const ctx = ctxOf(s);
  assert.ok(eligibleAchievements(ctx).includes('jdm-collector'));
  assert.ok(!eligibleAchievements(ctx).includes('italian-collection'));
  assert.ok(eligibleAchievements(ctx).includes('five-engines') === japanese.length >= 5);
  const colls = collections(ENGINE_CATALOG);
  assert.equal(colls[0]?.id, 'all');
  assert.equal(colls[0]?.engineIds.length, ENGINE_CATALOG.length);
  const jdm = colls.find((c) => c.id === 'japanese');
  assert.ok(jdm);
  assert.deepEqual(collectionProgress(jdm, new Set(enginesTried(s))), { current: japanese.length, target: japanese.length });
  assert.ok(!colls.some((c) => c.id === 'generic'), 'single-engine origins are not a collection');
});

test('streak and profile explorer achievements', () => {
  let s = emptyStatistics();
  for (let d = 1; d <= 7; d++) s = addActiveDay(s, `2026-11-0${d}`);
  s.driveProfileSeconds = { comfort: 30, sport: 30, track: 30 };
  const ids = eligibleAchievements(ctxOf(s, { today: '2026-11-20' }));
  assert.ok(ids.includes('seven-day-streak'), 'best streak counts even after it ended');
  assert.ok(ids.includes('profile-explorer'));
});

test('challenges: local provider, progress capped at target', () => {
  const s = emptyStatistics();
  s.layoutsTried = ['v', 'inline', 'boxer', 'rotary'];
  s.activeDays = ['2026-11-01', '2026-11-02'];
  const list = LOCAL_CHALLENGES.list(ctxOf(s, { favorites: ['a'] }));
  assert.equal(LOCAL_CHALLENGES.online, false);
  const byId = new Map(list.map((c) => [c.id, c]));
  assert.deepEqual(byId.get('three-layouts')?.progress, { current: 3, target: 3 });
  assert.equal(byId.get('three-layouts')?.done, true);
  assert.deepEqual(byId.get('five-days')?.progress, { current: 2, target: 5 });
  assert.equal(byId.get('five-favorites')?.done, false);
  assert.ok(byId.get('complete-collection')?.collection);
});

// --- Profile card ---------------------------------------------------------------------------

test('favorite engine = most driven engine that still exists', () => {
  const s = emptyStatistics();
  s.engineSeconds = { k20a: 100, 'custom-gone': 500, gt3flat6: 50 };
  assert.equal(favoriteEngine(s, (id) => id !== 'custom-gone'), 'k20a');
  assert.equal(favoriteEngine(emptyStatistics(), () => true), null);
});

test('share card holds only allowed fields and the text never contains location data', () => {
  const tr = new StatsTracker(emptyStatistics());
  tr.startCycle();
  drive(tr, 3700, { mode: 'gps' });
  const ach = awardAchievements({ unlocked: {} }, ctxOf(tr.stats), 1).state;
  const card = buildShareCard({
    profile: { displayName: 'Vojta', vehicle: 'Model Y' }, stats: tr.stats, achievements: ach,
    favoriteEngineTitle: 'FLAT-6 RS', enginesTotal: 20, theme: 'dark', today: dayKey(T0),
  });
  assert.deepEqual(Object.keys(card).sort(), [
    'achievementsTotal', 'achievementsUnlocked', 'displayName', 'driveSeconds', 'enginesTotal', 'enginesTried',
    'favoriteEngine', 'featured', 'streak', 'theme', 'vehicle',
  ]);
  const cs = shareText(card, translator('cs'), 'https://example.test/app/');
  assert.match(cs, /Vojta/);
  assert.match(cs, /Model Y/);
  assert.match(cs, /1 h 1 min/);
  assert.match(cs, /První start/);
  assert.doesNotMatch(cs, /\b(lat|lon|latitude|longitude|gps)\b|km\/h|\d+\.\d{4,}/i);
  const en = shareText({ ...card, displayName: '', vehicle: '' }, translator('en'), '');
  assert.match(en, /REVLINE driver/);
  assert.doesNotMatch(en, /Vehicle/);
});

test('formatDuration and cleanText', () => {
  const t = translator('en');
  assert.equal(formatDuration(0, t), '0 min');
  assert.equal(formatDuration(59 * 60 + 59, t), '59 min');
  assert.equal(formatDuration(14 * 3600 + 32 * 60, t), '14 h 32 min');
  assert.equal(cleanText('  a\n\tb  '), 'a b');
  assert.equal(cleanText(42), '');
});
