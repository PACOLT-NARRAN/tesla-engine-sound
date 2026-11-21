import type { EngineCatalogEntry, EngineOrigin } from '../types/catalog.ts';
import { ID_PATTERN, asRecord, type StoredSchema } from '../storage/storage.ts';
import { currentStreak, driveProfilesUsed, enginesTried, type Statistics } from './stats.ts';

/**
 * Achievements, collections and challenges (pure, unit tested; no React).
 * Nothing here is based on vehicle speed, acceleration or GPS performance.
 * Achievement ids are STABLE: they are stored, so never rename one.
 */

/** Everything the rules look at. */
export interface EngagementContext {
  stats: Statistics;
  favorites: readonly string[];
  /** Sound Studio engines currently saved. */
  customCount: number;
  catalog: readonly EngineCatalogEntry[];
  /** Local day "YYYY-MM-DD" (for the current streak). */
  today: string;
}

export interface Progress {
  current: number;
  target: number;
}

const progress = (current: number, target: number): Progress => ({ current: Math.min(current, target), target });

// --- Collections ---------------------------------------------------------------------------

export type CollectionId = 'all' | EngineOrigin | `pack:${string}`;

export interface Collection {
  id: CollectionId;
  engineIds: readonly string[];
}

const ORIGIN_ORDER: readonly EngineOrigin[] = ['italian', 'german', 'american', 'japanese', 'british'];

/** "All engines", one per origin that has at least two engines, one per premium pack. */
export function collections(catalog: readonly EngineCatalogEntry[]): Collection[] {
  const out: Collection[] = [{ id: 'all', engineIds: catalog.map((e) => e.id) }];
  for (const o of ORIGIN_ORDER) {
    const ids = catalog.filter((e) => e.origin === o).map((e) => e.id);
    if (ids.length >= 2) out.push({ id: o, engineIds: ids });
  }
  const packs = [...new Set(catalog.map((e) => e.packId).filter((p): p is string => p !== null))];
  for (const p of packs) out.push({ id: `pack:${p}`, engineIds: catalog.filter((e) => e.packId === p).map((e) => e.id) });
  return out;
}

export function collectionProgress(c: Collection, tried: ReadonlySet<string>): Progress {
  return progress(c.engineIds.filter((id) => tried.has(id)).length, c.engineIds.length);
}

const originIds = (catalog: readonly EngineCatalogEntry[], o: EngineOrigin) => catalog.filter((e) => e.origin === o).map((e) => e.id);

// --- Achievements --------------------------------------------------------------------------

export const ACHIEVEMENT_IDS = [
  'first-ignition', 'five-engines', 'three-layouts', 'ten-sessions', 'seven-day-streak', 'manual-driver',
  'profile-explorer', 'garage-builder', 'studio-creator', 'jdm-collector', 'italian-collection',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Seconds of manual shifting for Manual Driver. */
export const MANUAL_DRIVER_S = 600;

interface AchievementRule {
  id: AchievementId;
  progress: (c: EngagementContext) => Progress;
}

const RULES: readonly AchievementRule[] = [
  { id: 'first-ignition', progress: (c) => progress(c.stats.ignitions, 1) },
  { id: 'five-engines', progress: (c) => progress(enginesTried(c.stats).length, 5) },
  { id: 'three-layouts', progress: (c) => progress(c.stats.layoutsTried.length, 3) },
  { id: 'ten-sessions', progress: (c) => progress(c.stats.sessions, 10) },
  { id: 'seven-day-streak', progress: (c) => progress(Math.max(c.stats.bestStreak, currentStreak(c.stats.activeDays, c.today)), 7) },
  { id: 'manual-driver', progress: (c) => progress(Math.floor(c.stats.manualSeconds / 60), MANUAL_DRIVER_S / 60) },
  { id: 'profile-explorer', progress: (c) => progress(driveProfilesUsed(c.stats).length, 3) },
  { id: 'garage-builder', progress: (c) => progress(c.favorites.length, 5) },
  { id: 'studio-creator', progress: (c) => progress(Math.max(c.stats.enginesCreated, c.customCount > 0 ? 1 : 0), 1) },
  {
    id: 'jdm-collector',
    progress: (c) => {
      const ids = originIds(c.catalog, 'japanese');
      const tried = new Set(enginesTried(c.stats));
      return progress(ids.filter((id) => tried.has(id)).length, Math.max(1, ids.length));
    },
  },
  {
    id: 'italian-collection',
    progress: (c) => {
      const ids = originIds(c.catalog, 'italian');
      const tried = new Set(enginesTried(c.stats));
      return progress(ids.filter((id) => tried.has(id)).length, Math.max(1, ids.length));
    },
  },
];

export interface AchievementView {
  id: AchievementId;
  progress: Progress;
  /** Epoch ms it was awarded, null if not yet. */
  unlockedAt: number | null;
}

/** Stored awards: id → epoch ms. Awards are permanent (only Reset removes them). */
export interface AchievementState {
  unlocked: Record<string, number>;
}

export function achievementViews(ctx: EngagementContext, state: AchievementState): AchievementView[] {
  return RULES.map((r) => ({ id: r.id, progress: r.progress(ctx), unlockedAt: state.unlocked[r.id] ?? null }));
}

/** Ids whose condition is met now. */
export function eligibleAchievements(ctx: EngagementContext): AchievementId[] {
  return RULES.filter((r) => {
    const p = r.progress(ctx);
    return p.current >= p.target;
  }).map((r) => r.id);
}

/**
 * Awards every eligible achievement that was not awarded before. Idempotent: calling it again
 * returns the same state object and no new ids, so nothing is awarded twice.
 */
export function awardAchievements(state: AchievementState, ctx: EngagementContext, now: number): { state: AchievementState; awarded: AchievementId[] } {
  const awarded = eligibleAchievements(ctx).filter((id) => state.unlocked[id] === undefined);
  if (awarded.length === 0) return { state, awarded };
  const unlocked = { ...state.unlocked };
  for (const id of awarded) unlocked[id] = now;
  return { state: { unlocked }, awarded };
}

/** Awarded achievements, newest first. */
export function recentAchievements(state: AchievementState): AchievementId[] {
  return ACHIEVEMENT_IDS.filter((id) => state.unlocked[id] !== undefined).sort((a, b) => (state.unlocked[b] ?? 0) - (state.unlocked[a] ?? 0));
}

export const ACHIEVEMENTS_SCHEMA: StoredSchema<AchievementState> = {
  key: 'revline.achievements.v1',
  version: 1,
  defaults: () => ({ unlocked: {} }),
  // Unknown but well-formed ids are kept (written by a newer build), invalid entries dropped.
  sanitize: (data) => {
    const unlocked: Record<string, number> = {};
    for (const [id, at] of Object.entries(asRecord(asRecord(data).unlocked))) {
      if (ID_PATTERN.test(id) && typeof at === 'number' && Number.isFinite(at) && at > 0) unlocked[id] = at;
    }
    return { unlocked };
  },
};

// --- Challenges ----------------------------------------------------------------------------

export type ChallengeId = 'three-layouts' | 'manual-demo' | 'drive-profiles' | 'complete-collection' | 'five-days' | 'create-engine' | 'five-favorites';

export interface ChallengeView {
  id: ChallengeId;
  progress: Progress;
  done: boolean;
  /** For 'complete-collection': the collection closest to completion. */
  collection?: CollectionId;
}

/**
 * Source of challenges. Today only the local one exists; a future online source (community
 * challenges) implements the same interface and is merged in the Profile screen.
 */
export interface ChallengeProvider {
  readonly id: string;
  /** True when challenges come from a server (none do yet). */
  readonly online: boolean;
  list(ctx: EngagementContext): ChallengeView[];
}

function view(id: ChallengeId, p: Progress, collection?: CollectionId): ChallengeView {
  return collection === undefined ? { id, progress: p, done: p.current >= p.target } : { id, progress: p, done: p.current >= p.target, collection };
}

export const LOCAL_CHALLENGES: ChallengeProvider = {
  id: 'local',
  online: false,
  list(ctx) {
    const s = ctx.stats;
    const tried = new Set(enginesTried(s));
    // Closest-to-complete collection other than "all" (ties: the smaller one).
    let best: { c: Collection; p: Progress } | null = null;
    for (const c of collections(ctx.catalog)) {
      if (c.id === 'all') continue;
      const p = collectionProgress(c, tried);
      const ratio = p.current / p.target;
      const bestRatio = best ? best.p.current / best.p.target : -1;
      if (ratio > bestRatio || (ratio === bestRatio && best && p.target < best.p.target)) best = { c, p };
    }
    const out: ChallengeView[] = [
      view('three-layouts', progress(s.layoutsTried.length, 3)),
      view('manual-demo', progress(s.manualDemoSessions, 1)),
      view('drive-profiles', progress(driveProfilesUsed(s).length, 3)),
    ];
    if (best) out.push(view('complete-collection', best.p, best.c.id));
    out.push(
      view('five-days', progress(s.activeDays.length, 5)),
      view('create-engine', progress(Math.max(s.enginesCreated, ctx.customCount > 0 ? 1 : 0), 1)),
      view('five-favorites', progress(ctx.favorites.length, 5)),
    );
    return out;
  },
};
