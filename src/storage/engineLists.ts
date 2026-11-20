import { sanitizeIdList, type StoredSchema } from './storage.ts';

/**
 * Favorites and Last Used engines. Pure list operations (unit tested) plus their storage schemas.
 * Lists hold stable engine ids — never display names — so renaming an engine keeps them intact.
 */

export const MAX_RECENT = 3;
export const MAX_FAVORITES = 200;

export function isFavorite(list: readonly string[], id: string): boolean {
  return list.includes(id);
}

/** Adds the id if missing (to the end, keeping the user's order), removes it if present. */
export function toggleFavorite(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, MAX_FAVORITES);
}

/** Newest first, no duplicates, at most `max` entries. */
export function pushRecent(list: readonly string[], id: string, max = MAX_RECENT): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** Drops ids of engines that no longer exist (removed profile, deleted custom engine). */
export function reconcileIds(list: readonly string[], known: ReadonlySet<string>): string[] {
  return list.filter((x) => known.has(x));
}

export const FAVORITES_SCHEMA: StoredSchema<string[]> = {
  key: 'revline.favorites.v1',
  version: 1,
  defaults: () => [],
  sanitize: (data) => sanitizeIdList(data, MAX_FAVORITES),
};

export const RECENT_SCHEMA: StoredSchema<string[]> = {
  key: 'revline.recentEngines.v1',
  version: 1,
  defaults: () => [],
  sanitize: (data) => sanitizeIdList(data, MAX_RECENT),
};
