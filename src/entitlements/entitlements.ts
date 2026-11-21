import type { DriveProfileId } from '../drivetrain/driveProfiles.ts';
import type { EngineTier } from '../types/catalog.ts';

/**
 * Entitlements: which product capabilities the user may use. Pure and synchronous; EVERY feature
 * check in the app goes through the functions below (no `isPro` checks in components).
 *
 * Today nothing can be bought. The plan comes from PRODUCT.earlyAccess (everything unlocked) or
 * from the Developer Mode simulator. These are LOCAL flags — they are not payment security, and
 * editing localStorage can change what the UI unlocks. Real ownership will come from a server.
 */
export type Plan = 'free' | 'pro';

export type Capability =
  | 'manual-shifting'
  | 'drive-profile.sport'
  | 'drive-profile.track'
  | 'custom-profiles'
  | 'custom-gearing'
  | 'pro-engines'
  | 'advanced-sound';

/** Single place for the commercial switch. Prices live in products.ts / packs.ts. */
export const PRODUCT = {
  /** Until real purchases exist, every user gets every PRO capability and every pack. */
  earlyAccess: true,
} as const;

export const PLAN_CAPABILITIES: Readonly<Record<Plan, readonly Capability[]>> = {
  free: [],
  pro: ['manual-shifting', 'drive-profile.sport', 'drive-profile.track', 'custom-profiles', 'custom-gearing', 'pro-engines', 'advanced-sound'],
};

/** Capability needed for each Drive Profile; COMFORT is always free. */
export const DRIVE_PROFILE_CAPABILITY: Readonly<Record<DriveProfileId, Capability | null>> = {
  comfort: null,
  sport: 'drive-profile.sport',
  track: 'drive-profile.track',
};

/** Developer Mode override: 'auto' = the real plan. */
export type PlanOverride = 'auto' | Plan;

export interface Entitlements {
  plan: Plan;
  /** Packs the user owns (simulated today). Early access unlocks every pack without owning it. */
  ownedPackIds: readonly string[];
  /** True when the plan comes from early access rather than a purchase. */
  earlyAccess: boolean;
  /** True when Developer Mode forces the plan / packs (development simulation). */
  simulated: boolean;
}

/**
 * `override` / `simulatedPacks` come from Developer Mode only. Any override switches early access
 * off, so the simulated state is exactly what the developer chose.
 */
export function resolveEntitlements(override: PlanOverride, earlyAccess: boolean = PRODUCT.earlyAccess, simulatedPacks: readonly string[] = []): Entitlements {
  if (override !== 'auto') return { plan: override, ownedPackIds: [...simulatedPacks], earlyAccess: false, simulated: true };
  return { plan: earlyAccess ? 'pro' : 'free', ownedPackIds: [], earlyAccess, simulated: false };
}

export function hasCapability(e: Entitlements, c: Capability): boolean {
  return PLAN_CAPABILITIES[e.plan].includes(c);
}

// --- Drive behaviour ---------------------------------------------------------------------------

export function isDriveProfileLocked(e: Entitlements, id: DriveProfileId): boolean {
  const cap = DRIVE_PROFILE_CAPABILITY[id];
  return cap !== null && !hasCapability(e, cap);
}

export const canUseSportProfile = (e: Entitlements): boolean => !isDriveProfileLocked(e, 'sport');
export const canUseTrackProfile = (e: Entitlements): boolean => !isDriveProfileLocked(e, 'track');
export const canUseManualShifting = (e: Entitlements): boolean => hasCapability(e, 'manual-shifting');

/**
 * The Drive Profile that actually runs. A locked profile stays SELECTED (it is never erased);
 * in Demo it plays as a preview, on a real GPS drive COMFORT is used instead.
 */
export function effectiveDriveProfile(e: Entitlements, selected: DriveProfileId, mode: 'gps' | 'demo'): { id: DriveProfileId; locked: boolean; preview: boolean } {
  const locked = isDriveProfileLocked(e, selected);
  if (!locked) return { id: selected, locked: false, preview: false };
  if (mode === 'demo') return { id: selected, locked: true, preview: true };
  return { id: 'comfort', locked: true, preview: false };
}

/** Manual shifting follows the same rule: allowed with the capability, or as a Demo preview. */
export function canUseManual(e: Entitlements, mode: 'gps' | 'demo'): boolean {
  return canUseManualShifting(e) || mode === 'demo';
}

/**
 * Advanced sound layers (overrun crackle, blow-off, synthesised turbo / supercharger, strong
 * downshift bark). FREE plays the basic sound model on GPS drives; Demo previews the full one.
 */
export function canUseAdvancedOverrun(e: Entitlements, mode: 'gps' | 'demo'): boolean {
  return hasCapability(e, 'advanced-sound') || mode === 'demo';
}

// --- Sound Studio ------------------------------------------------------------------------------

/** Saving (creating / editing) custom engines. Everyone may open the editor and preview. */
export function canCreateCustomProfile(e: Entitlements): boolean {
  return hasCapability(e, 'custom-profiles');
}

/** Entering own gear ratios (generated ratios are always available). */
export function canUseCustomGearing(e: Entitlements): boolean {
  return hasCapability(e, 'custom-gearing');
}

// --- Engines and packs -------------------------------------------------------------------------

/** What an engine needs: its tier and pack (catalog), or the Sound Studio for custom engines. */
export interface EngineRequirement {
  custom: boolean;
  tier: EngineTier;
  packId: string | null;
  /** Custom engines: requirement of the engine whose recorded sound they borrow. */
  borrows?: { tier: EngineTier; packId: string | null } | null;
}

export const FREE_ENGINE: EngineRequirement = { custom: false, tier: 'free', packId: null };

/** Owned, or unlocked by early access. */
export function canInstallPack(e: Entitlements, packId: string): boolean {
  return e.earlyAccess || e.ownedPackIds.includes(packId);
}

/** Why an engine is locked, or null if it may be driven. */
export type EngineLock = 'pro' | 'pack' | 'studio' | null;

export function engineLock(e: Entitlements, r: EngineRequirement): EngineLock {
  if (r.custom) {
    if (!hasCapability(e, 'custom-profiles')) return 'studio';
    return r.borrows ? engineLock(e, { custom: false, tier: r.borrows.tier, packId: r.borrows.packId }) : null;
  }
  if (r.packId !== null) return canInstallPack(e, r.packId) ? null : 'pack';
  if (r.tier === 'pro') return hasCapability(e, 'pro-engines') ? null : 'pro';
  return null;
}

/** May this engine be driven on a GPS drive? */
export function canUseEngine(e: Entitlements, r: EngineRequirement): boolean {
  return engineLock(e, r) === null;
}

/**
 * The engine that actually runs. A locked engine stays SELECTED: the Garage preview and Demo
 * play it (try before you buy); a GPS drive uses `fallbackId` (the last engine the user may drive).
 */
export function effectiveEngine(
  e: Entitlements, selected: { id: string; requirement: EngineRequirement }, mode: 'gps' | 'demo', fallbackId: string,
): { id: string; locked: boolean; preview: boolean } {
  if (canUseEngine(e, selected.requirement)) return { id: selected.id, locked: false, preview: false };
  if (mode === 'demo') return { id: selected.id, locked: true, preview: true };
  return { id: fallbackId, locked: true, preview: false };
}

/** Ownership line of a pack for the store screens. */
export type PackOwnership = 'owned' | 'early-access' | 'not-owned';

export function packOwnership(e: Entitlements, packId: string): PackOwnership {
  if (e.ownedPackIds.includes(packId)) return 'owned';
  if (e.earlyAccess) return 'early-access';
  return 'not-owned';
}
