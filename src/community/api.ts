import { MOCK_AUTHORS, MOCK_ITEMS } from './mockData.ts';
import type { CommunityEngine, MarketplaceAuthor, MarketplaceItem } from './models.ts';

/**
 * The boundary between the Community UI and wherever listings come from. This build ships a
 * mock that serves bundled demo items; a future online Marketplace implements the same
 * interface (authentication, publication, reports and purchases are verified by its backend).
 */

export type MarketplaceKind = 'all' | 'engine' | 'pack';

export interface MarketplaceListing {
  items: MarketplaceItem[];
  authors: MarketplaceAuthor[];
  /** 'mock' = bundled demo content; 'remote' = a live Marketplace (not available yet). */
  source: 'mock' | 'remote';
}

export type ReportReason = 'broken' | 'wrong-info' | 'copyright' | 'offensive' | 'other';
export const REPORT_REASONS: readonly ReportReason[] = ['broken', 'wrong-info', 'copyright', 'offensive', 'other'];

/** A report or a publication request only reaches someone when a live Marketplace exists. */
export type SubmitResult = { sent: true; id: string } | { sent: false; reason: 'not-available' };

export interface PublicationRequest {
  title: string;
  description: string;
  tags: readonly string[];
  ownershipConfirmed: boolean;
}

export type MarketplaceErrorCode = 'network' | 'server' | 'offline';

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  constructor(code: MarketplaceErrorCode) {
    super(`marketplace ${code}`);
    this.code = code;
  }
}

export interface MarketplaceApi {
  list(): Promise<MarketplaceListing>;
  report(itemId: string, reason: ReportReason): Promise<SubmitResult>;
  publish(req: PublicationRequest): Promise<SubmitResult>;
}

/** Developer Mode switch for the mock, to see every UI state. Not persisted. */
export type MockMode = 'normal' | 'slow' | 'error' | 'empty' | 'offline';
export const MOCK_MODES: readonly MockMode[] = ['normal', 'slow', 'error', 'empty', 'offline'];

const LATENCY: Record<MockMode, number> = { normal: 250, slow: 2500, error: 400, empty: 250, offline: 150 };

export class MockMarketplaceApi implements MarketplaceApi {
  private readonly mode: () => MockMode;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(mode: () => MockMode = () => 'normal', sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
    this.mode = mode;
    this.sleep = sleep;
  }

  async list(): Promise<MarketplaceListing> {
    const mode = this.mode();
    await this.sleep(LATENCY[mode]);
    if (mode === 'error') throw new MarketplaceError('server');
    if (mode === 'offline') throw new MarketplaceError('offline');
    if (mode === 'empty') return { items: [], authors: [], source: 'mock' };
    return { items: structuredClone([...MOCK_ITEMS]), authors: structuredClone([...MOCK_AUTHORS]), source: 'mock' };
  }

  async report(): Promise<SubmitResult> {
    await this.sleep(LATENCY[this.mode()]);
    return { sent: false, reason: 'not-available' };
  }

  async publish(): Promise<SubmitResult> {
    await this.sleep(LATENCY[this.mode()]);
    return { sent: false, reason: 'not-available' };
  }
}

/** A live Marketplace client. None exists in this build. */
export const REMOTE_MARKETPLACE: MarketplaceApi | null = null;

// --- Querying (pure) -------------------------------------------------------------------------

export type CommunityFilter = MarketplaceKind | 'installed' | 'favorites';
export const COMMUNITY_FILTERS: readonly CommunityFilter[] = ['all', 'engine', 'pack', 'installed', 'favorites'];

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function itemSearchText(item: MarketplaceItem, author: MarketplaceAuthor | undefined): string {
  const parts = [item.title, item.summary.en, item.summary.cs, ...item.tags, author?.displayName ?? ''];
  if (item.kind === 'engine') parts.push(item.spec.layout, item.spec.induction);
  return fold(parts.join(' '));
}

export function queryItems(
  items: readonly MarketplaceItem[],
  opts: { filter: CommunityFilter; search: string },
  ctx: { authors: ReadonlyMap<string, MarketplaceAuthor>; isInstalled: (item: MarketplaceItem) => boolean; favorites: readonly string[] },
): MarketplaceItem[] {
  const words = fold(opts.search).split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (opts.filter === 'engine' && i.kind !== 'engine') return false;
    if (opts.filter === 'pack' && i.kind !== 'pack') return false;
    if (opts.filter === 'installed' && !ctx.isInstalled(i)) return false;
    if (opts.filter === 'favorites' && !ctx.favorites.includes(i.id)) return false;
    // Only published, not removed items are listed.
    if (i.publication !== 'published' || i.moderation === 'removed') return false;
    if (!words.length) return true;
    const text = itemSearchText(i, ctx.authors.get(i.authorId));
    return words.every((w) => text.includes(w));
  });
}

export const packEngines = (pack: { engineIds: readonly string[] }, items: readonly MarketplaceItem[]): CommunityEngine[] =>
  pack.engineIds.map((id) => items.find((i): i is CommunityEngine => i.kind === 'engine' && i.id === id)).filter((e): e is CommunityEngine => !!e);
