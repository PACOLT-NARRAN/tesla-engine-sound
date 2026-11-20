import { asRecord, pickBool, type StoredSchema } from '../storage/storage.ts';

/** Developer Mode options. Kept apart from user settings; cleared by Reset All. */
export interface DevOptions {
  /** Catch native scrolling (steering wheels that do not fire `wheel` events) and turn it into shifts. */
  scrollTrap: boolean;
}

export const DEV_OPTIONS_SCHEMA: StoredSchema<DevOptions> = {
  key: 'revline.developer.v1',
  version: 1,
  defaults: () => ({ scrollTrap: false }),
  sanitize: (data, d) => ({ scrollTrap: pickBool(asRecord(data).scrollTrap, d.scrollTrap) }),
};
