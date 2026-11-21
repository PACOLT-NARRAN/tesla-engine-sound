import type { BackendConfig } from './config.ts';

/**
 * Minimal Supabase Auth client for e-mail one-time codes (docs/BACKEND.md, section 5).
 *
 * Plain fetch against the documented Auth REST endpoints instead of the full SDK: the app needs
 * only four calls, and this keeps the bundle small. Pure apart from the injected fetch, so it is
 * tested with a fake server.
 */

/** `not-authorized`: Supabase's built-in test mailer only sends to members of the project's team. */
export type AuthErrorCode = 'invalid-email' | 'invalid-code' | 'rate-limited' | 'not-authorized' | 'session-expired' | 'network' | 'server';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode) {
    super(`auth ${code}`);
    this.code = code;
  }
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  user: AuthUser;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<FetchResponseLike>;

export const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length <= EMAIL_MAX && EMAIL_RE.test(e);
}

/** Supabase sends 6 digits by default (configurable up to 10). Spaces typed by the user are ignored. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '');
}

export function isValidCode(code: string): boolean {
  return /^\d{6,10}$/.test(normalizeCode(code));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Turns a Supabase token response into a session; null when the shape is not what we expect. */
export function parseSession(body: unknown, now: number): AuthSession | null {
  if (!isRecord(body)) return null;
  const { access_token, refresh_token, expires_in, expires_at, user } = body;
  if (typeof access_token !== 'string' || typeof refresh_token !== 'string' || !isRecord(user)) return null;
  if (typeof user.id !== 'string' || !user.id) return null;
  const email = typeof user.email === 'string' ? user.email : '';
  let expiresAtMs: number;
  if (typeof expires_at === 'number' && Number.isFinite(expires_at)) expiresAtMs = expires_at * 1000;
  else if (typeof expires_in === 'number' && Number.isFinite(expires_in)) expiresAtMs = now + expires_in * 1000;
  else expiresAtMs = now + 3600_000;
  return { accessToken: access_token, refreshToken: refresh_token, expiresAt: expiresAtMs, user: { id: user.id, email } };
}

export class SupabaseAuthApi {
  private readonly config: BackendConfig;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;

  constructor(config: BackendConfig, fetchFn: FetchLike, now: () => number = Date.now) {
    this.config = config;
    this.fetchFn = fetchFn;
    this.now = now;
  }

  /** Sends a sign-in code. New e-mail addresses get an account automatically. */
  async requestCode(email: string): Promise<void> {
    if (!isValidEmail(email)) throw new AuthError('invalid-email');
    const res = await this.post('/auth/v1/otp', { email: normalizeEmail(email), create_user: true });
    if (res.ok) return;
    if (res.status === 429) throw new AuthError('rate-limited');
    if (res.status >= 500) throw new AuthError('server');
    const detail = JSON.stringify(await this.body(res) ?? '').toLowerCase();
    throw new AuthError(/not[ _-]?authori[sz]ed/.test(detail) ? 'not-authorized' : 'invalid-email');
  }

  async verifyCode(email: string, code: string): Promise<AuthSession> {
    if (!isValidCode(code)) throw new AuthError('invalid-code');
    const res = await this.post('/auth/v1/verify', { type: 'email', email: normalizeEmail(email), token: normalizeCode(code) });
    if (!res.ok) throw new AuthError(res.status === 429 ? 'rate-limited' : res.status >= 500 ? 'server' : 'invalid-code');
    const session = parseSession(await this.body(res), this.now());
    if (!session) throw new AuthError('server');
    return session;
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const res = await this.post('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
    if (!res.ok) throw new AuthError(res.status === 429 ? 'rate-limited' : res.status >= 500 ? 'server' : 'session-expired');
    const session = parseSession(await this.body(res), this.now());
    if (!session) throw new AuthError('server');
    return session;
  }

  /** Ends the session on the server. Failures are ignored: the local session is removed anyway. */
  async signOut(accessToken: string): Promise<void> {
    try {
      await this.post('/auth/v1/logout', undefined, accessToken);
    } catch {
      /* offline: the token simply expires */
    }
  }

  private async post(path: string, payload: unknown, bearer?: string): Promise<FetchResponseLike> {
    const headers: Record<string, string> = { apikey: this.config.key, 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    try {
      return await this.fetchFn(`${this.config.url}${path}`, { method: 'POST', headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    } catch {
      throw new AuthError('network');
    }
  }

  private async body(res: FetchResponseLike): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
}
