import { asRecord, sanitizeIdList, type StoredSchema } from '../storage/storage.ts';
import { DESCRIPTION_MAX, NAME_MAX, validateSpec, type CustomEngineSpec } from '../studio/customEngine.ts';
import {
  COMMUNITY_FORMAT, compareVersions, latestVersion,
  type CommunityEngine, type CommunityPack, type InstallationStatus, type MarketplaceItem, type SoundOrigin,
} from './models.ts';

/**
 * Install / preview rules for Community items (pure, unit tested).
 *
 * Installing an engine saves it as a Sound Studio engine (id `custom-cm…`), so the Garage,
 * selection, Favorites and the drivetrain need no new code. What was installed and at which
 * version is remembered in `revline.community.v1`, with the user's local favorites and ratings.
 */

export const COMMUNITY_ID_PREFIX = 'custom-cm';

/** Garage id of an installed community engine (fits the custom-id pattern: `custom-[a-z0-9]+`). */
export const communityCustomId = (itemId: string): string => `${COMMUNITY_ID_PREFIX}${itemId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 38)}`;
export const isCommunityEngineId = (id: string): boolean => id.startsWith(COMMUNITY_ID_PREFIX);

export interface InstallRecord {
  version: string;
  installedAt: number;
}

export interface CommunityLocal {
  installed: Record<string, InstallRecord>;
  favorites: string[];
  /** The user's own 1–5 stars. Stays on this device; not a public rating. */
  ratings: Record<string, number>;
}

const ITEM_ID = /^[a-z0-9-]{1,48}$/;
const VERSION = /^\d{1,4}(\.\d{1,4}){0,2}$/;

export const COMMUNITY_SCHEMA: StoredSchema<CommunityLocal> = {
  key: 'revline.community.v1',
  version: 1,
  defaults: () => ({ installed: {}, favorites: [], ratings: {} }),
  sanitize: (data) => {
    const o = asRecord(data);
    const installed: Record<string, InstallRecord> = {};
    for (const [id, raw] of Object.entries(asRecord(o.installed))) {
      const r = asRecord(raw);
      if (!ITEM_ID.test(id) || typeof r.version !== 'string' || !VERSION.test(r.version)) continue;
      installed[id] = { version: r.version, installedAt: typeof r.installedAt === 'number' && Number.isFinite(r.installedAt) ? r.installedAt : 0 };
    }
    const ratings: Record<string, number> = {};
    for (const [id, v] of Object.entries(asRecord(o.ratings))) {
      if (ITEM_ID.test(id) && typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) ratings[id] = v;
    }
    return { installed, favorites: sanitizeIdList(o.favorites, 200), ratings };
  },
};

/** What this device can do, provided by the session (entitlements + sound banks). */
export interface InstallContext {
  /** Saving custom engines is allowed (PRO / early access). Community engines are saved as custom engines. */
  canSaveCustom: boolean;
  /** The plan includes PRO features (for items marked PRO). */
  hasPro: boolean;
  /** A built-in engine whose sound bank may not be used yet (PRO / pack lock). */
  bankLocked: (bankId: string) => boolean;
  /** Recorded sound banks that exist in this build. */
  banks: ReadonlySet<string>;
  /** Ids of custom engines currently in the Garage. */
  customIds: ReadonlySet<string>;
  local: CommunityLocal;
}

export type LockReason = 'pro' | 'paid' | 'bank-locked';
export type IncompatibleReason = 'format' | 'bank-missing';

export interface ItemState {
  status: InstallationStatus;
  /** Installed version, when installed. */
  installedVersion: string | null;
  lock?: LockReason;
  incompatible?: IncompatibleReason;
}

/** Installed version of an engine, or null if it is not (or no longer) in the Garage. */
export function installedVersion(item: CommunityEngine, ctx: InstallContext): string | null {
  const rec = ctx.local.installed[item.id];
  return rec && ctx.customIds.has(communityCustomId(item.id)) ? rec.version : null;
}

export function engineState(item: CommunityEngine, ctx: InstallContext): ItemState {
  const version = installedVersion(item, ctx);
  if (item.compatibility.format > COMMUNITY_FORMAT) return { status: 'incompatible', installedVersion: version, incompatible: 'format' };
  const bank = item.spec.sound.kind === 'bank' ? item.spec.sound.bankId : null;
  if (bank !== null && !ctx.banks.has(bank)) return { status: 'incompatible', installedVersion: version, incompatible: 'bank-missing' };
  if (version !== null) {
    return { status: compareVersions(latestVersion(item), version) > 0 ? 'update-available' : 'installed', installedVersion: version };
  }
  const lock = engineLockReason(item, ctx);
  return lock ? { status: 'locked', installedVersion: null, lock } : { status: 'not-installed', installedVersion: null };
}

function engineLockReason(item: CommunityEngine, ctx: InstallContext): LockReason | null {
  if (item.entitlement.access === 'paid') return 'paid';
  if (!ctx.canSaveCustom || (item.entitlement.access === 'pro' && !ctx.hasPro)) return 'pro';
  if (item.spec.sound.kind === 'bank' && ctx.bankLocked(item.spec.sound.bankId)) return 'bank-locked';
  return null;
}

/**
 * A pack is installed when all its engines are. Its own entitlement comes first (a paid pack is
 * locked as a whole); then the first blocking engine decides.
 */
export function packState(pack: CommunityPack, engines: readonly CommunityEngine[], ctx: InstallContext): ItemState {
  const states = engines.map((e) => engineState(e, ctx));
  const installedVersionOfPack = states.length > 0 && states.every((s) => s.installedVersion !== null) ? latestVersion(pack) : null;
  if (states.some((s) => s.status === 'update-available')) return { status: 'update-available', installedVersion: installedVersionOfPack };
  if (states.length > 0 && states.every((s) => s.status === 'installed')) return { status: 'installed', installedVersion: installedVersionOfPack };
  if (pack.entitlement.access === 'paid') return { status: 'locked', installedVersion: null, lock: 'paid' };
  if (!ctx.canSaveCustom || (pack.entitlement.access === 'pro' && !ctx.hasPro)) return { status: 'locked', installedVersion: null, lock: 'pro' };
  if (states.length === 0) return { status: 'incompatible', installedVersion: null, incompatible: 'format' };
  const blocked = states.find((s) => s.status === 'incompatible' || s.status === 'locked');
  if (blocked && states.every((s) => s.status !== 'not-installed')) return { ...blocked, installedVersion: null };
  return { status: 'not-installed', installedVersion: null };
}

export function itemState(item: MarketplaceItem, all: readonly MarketplaceItem[], ctx: InstallContext): ItemState {
  if (item.kind === 'engine') return engineState(item, ctx);
  const engines = item.engineIds
    .map((id) => all.find((i): i is CommunityEngine => i.kind === 'engine' && i.id === id))
    .filter((e): e is CommunityEngine => !!e);
  return packState(item, engines, ctx);
}

export const canInstall = (s: ItemState): boolean => s.status === 'not-installed' || s.status === 'update-available';

/** The Sound Studio engine an install creates (or overwrites on update). */
export function toCustomSpec(item: CommunityEngine, lang: 'en' | 'cs', now: number, createdAt = now): CustomEngineSpec {
  return {
    ...structuredClone(item.spec),
    id: communityCustomId(item.id),
    name: item.title.slice(0, NAME_MAX),
    description: item.summary[lang].slice(0, DESCRIPTION_MAX),
    createdAt,
    updatedAt: now,
  };
}

export function recordInstall(local: CommunityLocal, item: CommunityEngine, now: number): CommunityLocal {
  return { ...local, installed: { ...local.installed, [item.id]: { version: latestVersion(item), installedAt: now } } };
}

export function forgetInstall(local: CommunityLocal, itemId: string): CommunityLocal {
  const installed = { ...local.installed };
  delete installed[itemId];
  return { ...local, installed };
}

export function toggleFavorite(local: CommunityLocal, itemId: string): CommunityLocal {
  const favorites = local.favorites.includes(itemId) ? local.favorites.filter((f) => f !== itemId) : [...local.favorites, itemId];
  return { ...local, favorites };
}

/** Sets 1–5 stars, or removes the rating (null / same value again handled by the caller). */
export function setRating(local: CommunityLocal, itemId: string, stars: number | null): CommunityLocal {
  const ratings = { ...local.ratings };
  if (stars === null || !Number.isInteger(stars) || stars < 1 || stars > 5) delete ratings[itemId];
  else ratings[itemId] = stars;
  return { ...local, ratings };
}

// --- Publishing (checks only; nothing is sent in this build) -------------------------------

export const PUBLISH_TAGS = ['street', 'track', 'drag', 'cruiser', 'classic', 'exotic', 'jdm', 'muscle', 'turbo', 'na', 'v8', 'v12'] as const;
export const MAX_PUBLISH_TAGS = 3;
export const MIN_PUBLISH_DESCRIPTION = 20;

export type PublishIssue = 'invalidEngine' | 'communityCopy' | 'description' | 'tags' | 'tooManyTags' | 'ownership';

export interface PublishDraft {
  description: string;
  tags: readonly string[];
  ownershipConfirmed: boolean;
}

export const soundOriginOf = (spec: CustomEngineSpec): SoundOrigin => (spec.sound.kind === 'bank' ? 'project-bank' : 'synth');

/** The ownership sentence is needed only when the engine plays the user's own recording. */
export const needsOwnershipConfirmation = (origin: SoundOrigin): boolean => origin === 'user-recording';

export function validatePublication(spec: CustomEngineSpec, draft: PublishDraft, origin: SoundOrigin = soundOriginOf(spec)): PublishIssue[] {
  const out: PublishIssue[] = [];
  if (validateSpec(spec).length) out.push('invalidEngine');
  if (isCommunityEngineId(spec.id)) out.push('communityCopy');
  if (draft.description.trim().length < MIN_PUBLISH_DESCRIPTION) out.push('description');
  if (draft.tags.length === 0) out.push('tags');
  if (draft.tags.length > MAX_PUBLISH_TAGS) out.push('tooManyTags');
  if (needsOwnershipConfirmation(origin) && !draft.ownershipConfirmed) out.push('ownership');
  return out;
}
