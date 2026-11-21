import type { CustomEngineSpec } from '../studio/customEngine.ts';
import type { LocalizedText } from '../types/catalog.ts';

/**
 * Community Engine Marketplace — domain models (spec section I).
 *
 * In this static build every item is bundled DEMO content (`demo: true`). The same types are
 * the contract for a future online Marketplace; nothing here implies that publishing, ratings,
 * downloads or purchases exist yet.
 */

/** Version of the community engine format this build understands. Newer items are "incompatible". */
export const COMMUNITY_FORMAT = 1;

export type PublicationStatus = 'draft' | 'in-review' | 'published' | 'unlisted' | 'rejected' | 'taken-down';
export type ModerationStatus = 'not-reviewed' | 'approved' | 'flagged' | 'removed';
/** Derived on this device for one item (see install.ts). */
export type InstallationStatus = 'not-installed' | 'installed' | 'update-available' | 'incompatible' | 'locked';

export interface MarketplaceAuthor {
  id: string;
  displayName: string;
  /** Verified by the (future) Marketplace. Demo authors are the REVLINE team. */
  verified: boolean;
  bio: LocalizedText;
  demo: boolean;
}

/** Public rating. Only a live Marketplace can produce it — demo items have none (null). */
export interface RatingSummary {
  average: number;
  count: number;
}

/** What it costs to add an item. A paid item can never be bought in this build. */
export type MarketplaceEntitlement =
  | { access: 'free' }
  | { access: 'pro' }
  | { access: 'paid'; priceCents: number; currency: 'EUR' };

export interface EngineVersion {
  /** Semantic version, e.g. "1.2.0". */
  version: string;
  /** ISO date (YYYY-MM-DD). */
  releasedAt: string;
  notes: LocalizedText;
}

export interface Compatibility {
  /** Community format the item needs (see COMMUNITY_FORMAT). */
  format: number;
  /** Project sound bank the engine plays, or null for the synthesiser. */
  soundBankId: string | null;
}

/** Where an engine's sound comes from. Third-party recordings need the ownership confirmation. */
export type SoundOrigin = 'project-bank' | 'synth' | 'user-recording';

/** The engine itself, in Sound Studio terms (name and texts come from the listing). */
export type CommunityEngineSpec = Omit<CustomEngineSpec, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt'>;

interface ListingBase {
  id: string;
  title: string;
  summary: LocalizedText;
  authorId: string;
  tags: readonly string[];
  /** Newest first. */
  versions: readonly EngineVersion[];
  entitlement: MarketplaceEntitlement;
  publication: PublicationStatus;
  moderation: ModerationStatus;
  rating: RatingSummary | null;
  /** Real download count from a live Marketplace; null = unknown (always null for demo items). */
  downloads: number | null;
  /** Bundled example content, not made by a real community member. */
  demo: boolean;
}

export interface CommunityEngine extends ListingBase {
  kind: 'engine';
  spec: CommunityEngineSpec;
  compatibility: Compatibility;
  soundOrigin: SoundOrigin;
  /** "I created this recording or I have permission…" — required only for 'user-recording'. */
  ownershipConfirmed: boolean;
}

export interface CommunityPack extends ListingBase {
  kind: 'pack';
  engineIds: readonly string[];
}

export type MarketplaceItem = CommunityEngine | CommunityPack;

export const latestVersion = (item: MarketplaceItem): string => item.versions[0]?.version ?? '0.0.0';

/** Compares two "x.y.z" versions numerically (missing parts are 0; junk counts as 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}
