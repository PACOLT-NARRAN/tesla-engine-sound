import { Store } from '../core/Store.ts';
import type { LocalStore, StoredSchema } from '../storage/storage.ts';
import { AuthError, SupabaseAuthApi, isValidEmail, normalizeEmail, type AuthErrorCode, type AuthSession, type FetchLike } from './authApi.ts';
import type { BackendConfig } from './config.ts';

/**
 * Optional online account (docs/BACKEND.md, milestone M1). Sign-in with an e-mail one-time code.
 *
 * Without a backend configuration the status stays 'unavailable' and nothing is ever sent.
 * The account holds ONLY the e-mail address and the session tokens; no driving data, no GPS.
 * Purchases and server entitlements come in a later milestone; signing in unlocks nothing today.
 */

export type AccountStatus = 'unavailable' | 'signed-out' | 'code-sent' | 'signed-in';

export interface AccountState {
  status: AccountStatus;
  /** E-mail of the signed-in user, or the address a code was just sent to. */
  email: string | null;
  userId: string | null;
  busy: boolean;
  error: AuthErrorCode | null;
  /** When the last code was sent (for the "send again" cooldown). */
  codeSentAt: number | null;
}

/** A new code may be requested this long after the previous one (Supabase default limit). */
export const RESEND_COOLDOWN_MS = 60_000;
/** The access token is refreshed this long before it expires. */
const REFRESH_MARGIN_MS = 60_000;

interface StoredAccount {
  session: AuthSession | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const ACCOUNT_SCHEMA: StoredSchema<StoredAccount> = {
  key: 'revline.account.v1',
  version: 1,
  defaults: () => ({ session: null }),
  sanitize: (data, defaults) => {
    if (!isRecord(data) || !isRecord(data.session)) return defaults;
    const s = data.session;
    const u = isRecord(s.user) ? s.user : {};
    if (typeof s.accessToken !== 'string' || typeof s.refreshToken !== 'string' || !s.refreshToken) return defaults;
    if (typeof s.expiresAt !== 'number' || !Number.isFinite(s.expiresAt)) return defaults;
    if (typeof u.id !== 'string' || !u.id) return defaults;
    return {
      session: {
        accessToken: s.accessToken, refreshToken: s.refreshToken, expiresAt: s.expiresAt,
        user: { id: u.id, email: typeof u.email === 'string' ? u.email : '' },
      },
    };
  },
};

export interface AccountDeps {
  fetch?: FetchLike;
  now?: () => number;
}

function defaultFetch(): FetchLike | null {
  if (typeof fetch !== 'function') return null;
  return (url, init) => fetch(url, init);
}

export class AccountService {
  readonly store: Store<AccountState>;
  readonly config: BackendConfig | null;
  private readonly api: SupabaseAuthApi | null;
  private readonly storage: LocalStore;
  private readonly now: () => number;
  private session: AuthSession | null;
  private refreshing: Promise<AuthSession | null> | null = null;

  constructor(config: BackendConfig | null, storage: LocalStore, deps: AccountDeps = {}) {
    this.config = config;
    this.storage = storage;
    this.now = deps.now ?? Date.now;
    const fetchFn = deps.fetch ?? defaultFetch();
    this.api = config && fetchFn ? new SupabaseAuthApi(config, fetchFn, this.now) : null;
    this.session = this.api ? storage.load(ACCOUNT_SCHEMA).value.session : null;
    const s = this.session;
    this.store = new Store<AccountState>({
      status: !this.api ? 'unavailable' : s ? 'signed-in' : 'signed-out',
      email: s?.user.email ?? null, userId: s?.user.id ?? null, busy: false, error: null, codeSentAt: null,
    });
  }

  get available(): boolean {
    return this.api !== null;
  }

  /** On app start: renew an expired session. Offline keeps the user signed in. */
  async start(): Promise<void> {
    if (this.session && this.session.expiresAt - REFRESH_MARGIN_MS <= this.now()) await this.renew();
  }

  async requestCode(email: string): Promise<boolean> {
    if (!this.api || this.store.get().busy) return false;
    if (!isValidEmail(email)) {
      this.store.set({ error: 'invalid-email' });
      return false;
    }
    this.store.set({ busy: true, error: null });
    try {
      await this.api.requestCode(email);
      this.store.set({ status: 'code-sent', email: normalizeEmail(email), codeSentAt: this.now(), busy: false });
      return true;
    } catch (e) {
      this.store.set({ busy: false, error: e instanceof AuthError ? e.code : 'server' });
      return false;
    }
  }

  canResend(): boolean {
    const at = this.store.get().codeSentAt;
    return at === null || this.now() - at >= RESEND_COOLDOWN_MS;
  }

  async resendCode(): Promise<boolean> {
    const { email } = this.store.get();
    if (!email || !this.canResend()) return false;
    return this.requestCode(email);
  }

  async verifyCode(code: string): Promise<boolean> {
    const { status, email, busy } = this.store.get();
    if (!this.api || busy || status !== 'code-sent' || !email) return false;
    this.store.set({ busy: true, error: null });
    try {
      const session = await this.api.verifyCode(email, code);
      this.adopt(session);
      return true;
    } catch (e) {
      this.store.set({ busy: false, error: e instanceof AuthError ? e.code : 'server' });
      return false;
    }
  }

  /** Back from "enter the code" to "enter the e-mail". */
  cancelCode(): void {
    if (this.store.get().status !== 'code-sent') return;
    this.store.set({ status: 'signed-out', email: null, error: null, codeSentAt: null });
  }

  async signOut(): Promise<void> {
    const s = this.session;
    this.forgetLocal();
    if (s && this.api) await this.api.signOut(s.accessToken);
  }

  /** Removes the session from this device only (Reset Local Data). */
  forgetLocal(): void {
    this.session = null;
    this.storage.remove(ACCOUNT_SCHEMA.key);
    this.store.set({ status: this.api ? 'signed-out' : 'unavailable', email: null, userId: null, busy: false, error: null, codeSentAt: null });
  }

  /**
   * A valid access token for calls to the backend (later milestones), refreshed when needed.
   * Null when signed out or when the session could not be renewed.
   */
  async accessToken(): Promise<string | null> {
    if (!this.session) return null;
    if (this.session.expiresAt - REFRESH_MARGIN_MS > this.now()) return this.session.accessToken;
    const s = await this.renew();
    return s?.accessToken ?? null;
  }

  private renew(): Promise<AuthSession | null> {
    if (!this.api || !this.session) return Promise.resolve(null);
    if (this.refreshing) return this.refreshing;
    const api = this.api;
    const token = this.session.refreshToken;
    this.refreshing = (async () => {
      try {
        const s = await api.refresh(token);
        this.adopt(s);
        return s;
      } catch (e) {
        // Only a rejected refresh token signs the user out; offline / server errors keep the session.
        if (e instanceof AuthError && e.code === 'session-expired') {
          this.forgetLocal();
          this.store.set({ error: 'session-expired' });
        }
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private adopt(session: AuthSession): void {
    this.session = session;
    this.storage.save(ACCOUNT_SCHEMA, { session });
    this.store.set({ status: 'signed-in', email: session.user.email || this.store.get().email, userId: session.user.id, busy: false, error: null, codeSentAt: null });
  }
}
