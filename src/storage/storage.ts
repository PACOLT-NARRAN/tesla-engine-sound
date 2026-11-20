/**
 * Central, versioned local persistence. Every key REVLINE stores goes through here, so
 * components never touch localStorage directly.
 *
 * Stored format: `{ "v": <schema version>, "data": <payload> }`. Data written before this
 * layer existed (a bare object) is read as `legacyVersion`. On load the payload is migrated
 * step by step to the current version and then sanitised; a corrupted, unknown or invalid
 * value never throws — it falls back to safe defaults.
 *
 * Precise GPS data is never stored (no schema for it exists).
 */

/** Minimal subset of the Web Storage API, so tests can pass an in-memory backend. */
export interface KeyValueBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredSchema<T> {
  readonly key: string;
  /** Current schema version written by this build. */
  readonly version: number;
  /** Version assumed for a bare (non-enveloped) value written by older builds. */
  readonly legacyVersion?: number;
  readonly defaults: () => T;
  /** Migrations from version N to N+1, keyed by N. They receive and return raw (unvalidated) data. */
  readonly migrations?: Readonly<Record<number, (data: unknown) => unknown>>;
  /** Turns raw data into a valid value. Must never throw; repair or drop invalid parts. */
  readonly sanitize: (data: unknown, defaults: T) => T;
}

export type LoadOutcome = 'missing' | 'ok' | 'migrated' | 'corrupt' | 'future' | 'unavailable';

export interface LoadResult<T> {
  value: T;
  outcome: LoadOutcome;
  /** Version found in storage, null if nothing usable was there. */
  storedVersion: number | null;
}

export const STORAGE_PREFIX = 'revline.';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** In-memory backend for tests and for browsers where localStorage is unusable. */
export function createMemoryBackend(initial: Record<string, string> = {}): KeyValueBackend & { readonly entries: Map<string, string> } {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => void entries.set(k, v),
    removeItem: (k) => void entries.delete(k),
  };
}

/** Browser localStorage if usable (it throws in some private modes), otherwise null. */
function browserBackend(): KeyValueBackend | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = `${STORAGE_PREFIX}probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export class LocalStore {
  private readonly backend: KeyValueBackend | null;
  private readonly known = new Set<string>();
  /** Last load result per key, for Developer Mode. */
  readonly report = new Map<string, { version: number; storedVersion: number | null; outcome: LoadOutcome }>();

  constructor(backend?: KeyValueBackend | null) {
    this.backend = backend === undefined ? browserBackend() : backend;
  }

  get available(): boolean {
    return this.backend !== null;
  }

  load<T>(schema: StoredSchema<T>): LoadResult<T> {
    this.known.add(schema.key);
    const result = this.read(schema);
    this.report.set(schema.key, { version: schema.version, storedVersion: result.storedVersion, outcome: result.outcome });
    return result;
  }

  save<T>(schema: StoredSchema<T>, value: T): boolean {
    this.known.add(schema.key);
    if (!this.backend) return false;
    try {
      this.backend.setItem(schema.key, JSON.stringify({ v: schema.version, data: value }));
      return true;
    } catch {
      return false; // quota / private mode: preferences simply don't persist
    }
  }

  remove(key: string): void {
    try {
      this.backend?.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  /** Removes every key this build knows about (Reset Local Data). */
  clearAll(keys: readonly string[] = [...this.known]): void {
    for (const k of keys) this.remove(k);
  }

  private read<T>(schema: StoredSchema<T>): LoadResult<T> {
    const defaults = schema.defaults();
    if (!this.backend) return { value: defaults, outcome: 'unavailable', storedVersion: null };
    let text: string | null;
    try {
      text = this.backend.getItem(schema.key);
    } catch {
      return { value: defaults, outcome: 'unavailable', storedVersion: null };
    }
    if (text === null) return { value: defaults, outcome: 'missing', storedVersion: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { value: defaults, outcome: 'corrupt', storedVersion: null };
    }

    let version: number;
    let data: unknown;
    if (isRecord(parsed) && typeof parsed.v === 'number' && Number.isInteger(parsed.v) && 'data' in parsed) {
      version = parsed.v;
      data = parsed.data;
    } else if (schema.legacyVersion !== undefined) {
      version = schema.legacyVersion;
      data = parsed;
    } else {
      return { value: defaults, outcome: 'corrupt', storedVersion: null };
    }

    // Written by a newer build: don't guess, keep defaults (and don't overwrite until the user changes something).
    if (version > schema.version) return { value: defaults, outcome: 'future', storedVersion: version };

    const from = version;
    try {
      while (version < schema.version) {
        const step = schema.migrations?.[version];
        if (step) data = step(data);
        version++;
      }
    } catch {
      return { value: defaults, outcome: 'corrupt', storedVersion: from };
    }

    let value: T;
    try {
      value = schema.sanitize(data, defaults);
    } catch {
      return { value: defaults, outcome: 'corrupt', storedVersion: from };
    }
    return { value, outcome: from === schema.version ? 'ok' : 'migrated', storedVersion: from };
  }
}

// --- Small sanitising helpers shared by schemas -------------------------------------------

export const pickEnum = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

export const pickNumber = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

export const pickBool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export const pickString = (v: unknown, fallback: string, maxLen = 200): string =>
  typeof v === 'string' && v.length > 0 && v.length <= maxLen ? v : fallback;

export const asRecord = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});

/** Engine / profile ids: lowercase slugs (same rule as profile validation). */
export const ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** A clean list of unique, well-formed ids (order kept, first occurrence wins). */
export function sanitizeIdList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && ID_PATTERN.test(x) && !out.includes(x)) out.push(x);
    if (out.length >= max) break;
  }
  return out;
}
