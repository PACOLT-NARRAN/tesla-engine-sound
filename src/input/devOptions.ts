import type { PlanOverride } from '../entitlements/entitlements.ts';
import { asRecord, pickBool, pickEnum, type StoredSchema } from '../storage/storage.ts';

/** Developer Mode options. Kept apart from user settings; cleared by Reset All. */
export interface DevOptions {
  /** Catch native scrolling (steering wheels that do not fire `wheel` events) and turn it into shifts. */
  scrollTrap: boolean;
  /** Simulate a FREE or PRO user to test locked states. */
  plan: PlanOverride;
}

export const DEV_OPTIONS_SCHEMA: StoredSchema<DevOptions> = {
  key: 'revline.developer.v1',
  version: 2,
  defaults: () => ({ scrollTrap: false, plan: 'auto' }),
  migrations: { 1: (data) => ({ ...asRecord(data), plan: 'auto' }) },
  sanitize: (data, d) => {
    const o = asRecord(data);
    return { scrollTrap: pickBool(o.scrollTrap, d.scrollTrap), plan: pickEnum(o.plan, ['auto', 'free', 'pro'] as const, d.plan) };
  },
};
