import type { DriveProfileId } from '../drivetrain/driveProfiles.ts';

/**
 * Entitlements: which product capabilities the user may use. Pure and synchronous, so the UI
 * and the session can ask at any time. A later phase adds purchase / restore; today the plan is
 * decided by PRODUCT.earlyAccess (everything unlocked) or the Developer Mode plan simulator.
 */
export type Plan = 'free' | 'pro';

export type Capability =
  | 'manual-shifting'
  | 'drive-profile.sport'
  | 'drive-profile.track'
  | 'custom-profiles'
  | 'custom-gearing';

/** Single place for commercial configuration. */
export const PRODUCT = {
  /** Until real purchases exist, every user gets every PRO capability. */
  earlyAccess: true,
  proLifetimePriceEur: 9.99,
} as const;

export const PLAN_CAPABILITIES: Readonly<Record<Plan, readonly Capability[]>> = {
  free: [],
  pro: ['manual-shifting', 'drive-profile.sport', 'drive-profile.track', 'custom-profiles', 'custom-gearing'],
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
  /** True when the plan comes from early access rather than a purchase. */
  earlyAccess: boolean;
  /** True when Developer Mode forces the plan. */
  simulated: boolean;
}

export function resolveEntitlements(override: PlanOverride, earlyAccess: boolean = PRODUCT.earlyAccess): Entitlements {
  if (override !== 'auto') return { plan: override, earlyAccess: false, simulated: true };
  return { plan: earlyAccess ? 'pro' : 'free', earlyAccess, simulated: false };
}

export function hasCapability(e: Entitlements, c: Capability): boolean {
  return PLAN_CAPABILITIES[e.plan].includes(c);
}

export function isDriveProfileLocked(e: Entitlements, id: DriveProfileId): boolean {
  const cap = DRIVE_PROFILE_CAPABILITY[id];
  return cap !== null && !hasCapability(e, cap);
}

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
  return hasCapability(e, 'manual-shifting') || mode === 'demo';
}

/** Sound Studio: saving (creating / editing) custom engines. Everyone may open the editor and preview. */
export function canCreateCustomProfile(e: Entitlements): boolean {
  return hasCapability(e, 'custom-profiles');
}

/** Sound Studio: entering own gear ratios (generated ratios are always available). */
export function canUseCustomGearing(e: Entitlements): boolean {
  return hasCapability(e, 'custom-gearing');
}

/**
 * May this engine be selected and driven? Built-in engines: yes (all are FREE today).
 * Custom engines need the Sound Studio capability; they are never deleted when it is missing.
 */
export function canUseEngine(e: Entitlements, engine: { custom: boolean }): boolean {
  return !engine.custom || hasCapability(e, 'custom-profiles');
}
