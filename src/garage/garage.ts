import type { Language } from '../i18n/index.ts';
import type { EngineCatalogEntry, EngineTier } from '../types/catalog.ts';
import type { EngineProfile } from '../types/profile.ts';
import { asRecord, pickBool, pickEnum, type StoredSchema } from '../storage/storage.ts';

/**
 * Pure Garage logic (no React, no registry import, so it is unit tested in Node):
 * engine facts used by filters, filter matching, accent-insensitive text search and sorting.
 */

export const GARAGE_FILTERS = [
  'all', 'favorites', 'recent', 'free', 'pro', 'pack',
  'na', 'turbo', 'supercharged', 'v', 'inline', 'boxer', 'rotary', 'custom',
] as const;
export type GarageFilter = (typeof GARAGE_FILTERS)[number];

export const GARAGE_SORTS = ['recommended', 'name', 'rpm', 'displacement'] as const;
export type GarageSort = (typeof GARAGE_SORTS)[number];

export type LayoutGroup = 'v' | 'inline' | 'boxer' | 'rotary' | 'other';

export interface GarageItem {
  profile: EngineProfile;
  /** Catalog entry, undefined for an engine without product metadata. */
  meta: EngineCatalogEntry | undefined;
  /** Marketing name (catalog), else the profile name. */
  title: string;
  tier: EngineTier;
  packId: string | null;
  /** Sound Studio engine (id 'custom-…'). */
  custom: boolean;
}

export function layoutGroup(p: EngineProfile): LayoutGroup {
  switch (p.category) {
    case 'V12': case 'V10': case 'V8': return 'v';
    case 'Inline-6': case 'Inline-4': return 'inline';
    case 'Flat-6': return 'boxer';
    case 'Rotary': return 'rotary';
    default: return 'other';
  }
}

export const isTurbo = (p: EngineProfile) => p.aspiration === 'turbo' || p.aspiration === 'twin-turbo' || p.aspiration === 'twin-charged';
export const isSupercharged = (p: EngineProfile) => p.aspiration === 'supercharged' || p.aspiration === 'twin-charged';
export const isNaturallyAspirated = (p: EngineProfile) => p.aspiration === 'naturally-aspirated';

export function buildItems(profiles: readonly EngineProfile[], catalog: (id: string) => EngineCatalogEntry | undefined): GarageItem[] {
  return profiles.map((profile) => {
    const meta = catalog(profile.id);
    return { profile, meta, title: meta?.displayName ?? profile.name, tier: meta?.tier ?? 'free', packId: meta?.packId ?? null, custom: profile.id.startsWith('custom-') };
  });
}

export interface ListContext {
  favorites: readonly string[];
  recent: readonly string[];
}

export function matchesFilter(item: GarageItem, f: GarageFilter, ctx: ListContext): boolean {
  const p = item.profile;
  switch (f) {
    case 'all': return true;
    case 'favorites': return ctx.favorites.includes(p.id);
    case 'recent': return ctx.recent.includes(p.id);
    case 'free': return item.tier === 'free';
    case 'pro': return item.tier === 'pro';
    case 'pack': return item.tier === 'pack' || item.packId !== null;
    case 'na': return isNaturallyAspirated(p);
    case 'turbo': return isTurbo(p);
    case 'supercharged': return isSupercharged(p);
    case 'v': return layoutGroup(p) === 'v';
    case 'inline': return layoutGroup(p) === 'inline';
    case 'boxer': return layoutGroup(p) === 'boxer';
    case 'rotary': return layoutGroup(p) === 'rotary';
    case 'custom': return item.custom;
  }
}

/** Lowercase, accents removed ("Přeplňovaný" → "preplnovany"), whitespace collapsed. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Searchable text of one engine. `labels` supplies localized words (layout, induction, pack
 * name, tier) in every UI language, so "boxer", "přeplňovaný" and "turbo" all work.
 * The internal bank id is deliberately NOT included.
 */
export function searchText(item: GarageItem, labels: readonly string[]): string {
  const p = item.profile;
  const parts = [
    item.title,
    p.category,
    `${p.cylinders} cyl`,
    p.displacementL === null ? '' : `${p.displacementL} l ${String(p.displacementL).replace('.', ',')} l`,
    p.aspiration.replace(/-/g, ' '),
    item.tier,
    ...(item.meta ? [item.meta.shortDescription.en, item.meta.shortDescription.cs, item.meta.origin, ...item.meta.tags] : [p.description]),
    ...labels,
  ];
  return normalizeText(parts.join(' '));
}

/** Every word of the query must appear somewhere (AND), in any order. Empty query matches all. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  return words.every((w) => haystack.includes(w));
}

export function sortItems(items: readonly GarageItem[], sort: GarageSort, lang: Language): GarageItem[] {
  const list = [...items];
  const byName = (a: GarageItem, b: GarageItem) => a.title.localeCompare(b.title, lang);
  switch (sort) {
    // Built-in engines in catalog order, then the user's own engines.
    case 'recommended': return list.sort((a, b) => Number(a.custom) - Number(b.custom));
    case 'name': return list.sort(byName);
    case 'rpm': return list.sort((a, b) => b.profile.redlineRPM - a.profile.redlineRPM || byName(a, b));
    case 'displacement': return list.sort((a, b) => (b.profile.displacementL ?? 0) - (a.profile.displacementL ?? 0) || byName(a, b));
  }
}

export interface GarageQuery {
  filter: GarageFilter | `pack:${string}`;
  query: string;
  sort: GarageSort;
}

/** Filter + search + sort. `textOf` returns the precomputed search text of an item. */
export function queryGarage(items: readonly GarageItem[], q: GarageQuery, ctx: ListContext, textOf: (i: GarageItem) => string, lang: Language): GarageItem[] {
  const hits = items.filter((i) => (q.filter.startsWith('pack:') ? i.packId === q.filter.slice(5) : matchesFilter(i, q.filter as GarageFilter, ctx)) && matchesQuery(textOf(i), q.query));
  // Favorites / Last Used keep the user's own order unless another sort is chosen.
  if (q.sort === 'recommended' && (q.filter === 'favorites' || q.filter === 'recent')) {
    const order = q.filter === 'favorites' ? ctx.favorites : ctx.recent;
    return hits.sort((a, b) => order.indexOf(a.profile.id) - order.indexOf(b.profile.id));
  }
  return sortItems(hits, q.sort, lang);
}

export function countByFilter(items: readonly GarageItem[], ctx: ListContext): Record<GarageFilter, number> {
  const out = Object.fromEntries(GARAGE_FILTERS.map((f) => [f, 0])) as Record<GarageFilter, number>;
  for (const i of items) for (const f of GARAGE_FILTERS) if (matchesFilter(i, f, ctx)) out[f]++;
  return out;
}

// --- Kinds, pack shortcuts and the user's "hide" choices (update 32) -----------------------

/** Top-level Garage tabs: everything, real engines, fun sounds, music. */
export const GARAGE_KINDS = ['all', 'engines', 'fun', 'music'] as const;
export type GarageKind = (typeof GARAGE_KINDS)[number];

export function itemKind(item: GarageItem): Exclude<GarageKind, 'all'> {
  if (item.profile.audio.music) return 'music';
  if (item.profile.id.startsWith('fun-')) return 'fun';
  return 'engines';
}

/** Remembered Garage view: last tab and what the user chose to hide. */
export interface GarageView {
  kind: GarageKind;
  /** Hide FREE engines (someone who never wants to scroll past them). */
  hideFree: boolean;
  /** Hide everything the user cannot drive yet (locked PRO / pack items). */
  hideLocked: boolean;
  /** Show the fun sounds / the music tracks in the "All" tab too. */
  funInAll: boolean;
  musicInAll: boolean;
}

export const DEFAULT_GARAGE_VIEW: GarageView = { kind: 'all', hideFree: false, hideLocked: false, funInAll: true, musicInAll: false };

export const GARAGE_VIEW_SCHEMA: StoredSchema<GarageView> = {
  key: 'revline.garageView.v1',
  version: 1,
  defaults: () => ({ ...DEFAULT_GARAGE_VIEW }),
  sanitize: (data, d) => {
    const r = asRecord(data);
    return {
      kind: pickEnum(r.kind, GARAGE_KINDS, d.kind),
      hideFree: pickBool(r.hideFree, d.hideFree),
      hideLocked: pickBool(r.hideLocked, d.hideLocked),
      funInAll: pickBool(r.funInAll, d.funInAll),
      musicInAll: pickBool(r.musicInAll, d.musicInAll),
    };
  },
};

/**
 * Items visible under a tab with the user's hide choices. A search looks through every tab
 * (so "jingle" is found from anywhere); the hide choices always apply.
 */
export function scopeItems(items: readonly GarageItem[], view: GarageView, searching: boolean, locked: (i: GarageItem) => boolean): GarageItem[] {
  return items.filter((i) => {
    if (view.hideFree && !i.custom && i.tier === 'free') return false;
    if (view.hideLocked && !i.custom && locked(i)) return false;
    if (searching) return true;
    const k = itemKind(i);
    if (view.kind === 'all') return k === 'engines' || (k === 'fun' && view.funInAll) || (k === 'music' && view.musicInAll);
    return k === view.kind;
  });
}

/** Pack shortcut filter: `pack:<id>`. */
export type PackFilter = `pack:${string}`;
export type AnyFilter = GarageFilter | PackFilter;

export const isPackFilter = (f: AnyFilter): f is PackFilter => f.startsWith('pack:');

export function matchesAnyFilter(item: GarageItem, f: AnyFilter, ctx: ListContext): boolean {
  return isPackFilter(f) ? item.packId === f.slice(5) : matchesFilter(item, f, ctx);
}

/** Packs that have items in `items`, in the given order, with counts. */
export function packChips(items: readonly GarageItem[], order: readonly string[]): Array<{ id: string; count: number }> {
  const counts = new Map<string, number>();
  for (const i of items) if (i.packId) counts.set(i.packId, (counts.get(i.packId) ?? 0) + 1);
  return order.filter((id) => counts.has(id)).map((id) => ({ id, count: counts.get(id) ?? 0 }));
}
