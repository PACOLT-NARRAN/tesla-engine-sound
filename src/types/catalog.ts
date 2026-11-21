import type { Language } from '../i18n/index.ts';

/**
 * User-facing product metadata for an engine, kept apart from the technical profile
 * (src/profiles/engines/<id>.json) and the audio bank (public/audio/<id>/). All three are
 * joined by the stable engine id, so renaming an engine never breaks saved data.
 */
export type LocalizedText = Readonly<Record<Language, string>>;

/** Commercial tier (see TIERS in src/profiles/catalog.ts). */
export type EngineTier = 'free' | 'pro' | 'pack';

export type EngineOrigin = 'italian' | 'german' | 'american' | 'japanese' | 'british' | 'generic';

export interface EngineCatalogEntry {
  /** Stable engine id = profile id = audio bank folder. */
  readonly id: string;
  /** Marketing name shown to users (not translated). */
  readonly displayName: string;
  readonly shortDescription: LocalizedText;
  readonly origin: EngineOrigin;
  /** Free-form search tags (lowercase). Layout / induction tags are derived from the profile. */
  readonly tags: readonly string[];
  readonly tier: EngineTier;
  /** Premium pack the engine belongs to, null if none. */
  readonly packId: string | null;
}
