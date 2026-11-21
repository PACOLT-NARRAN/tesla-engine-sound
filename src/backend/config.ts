/**
 * Online backend configuration (docs/BACKEND.md, milestone M1).
 *
 * The build reads two PUBLIC values from GitHub repository variables (see .github/workflows/deploy.yml):
 * - VITE_SUPABASE_URL: the project URL, e.g. https://abcd.supabase.co
 * - VITE_SUPABASE_KEY: the project's publishable (anon) key. It is public by design; Row Level
 *   Security in the database decides what it may do.
 *
 * When either value is missing the backend is OFF and the app behaves exactly as before.
 * A secret / service-role key is refused here so it can never end up in the shipped bundle.
 */
export interface BackendConfig {
  /** Project URL without a trailing slash. */
  url: string;
  /** Publishable (anon) key. */
  key: string;
}

/** Decodes the payload of a JWT-shaped key without verifying it (only to detect a service-role key). */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json: unknown = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof json === 'object' && json !== null && typeof (json as { role?: unknown }).role === 'string' ? (json as { role: string }).role : null;
  } catch {
    return null;
  }
}

/** True for keys that must never be shipped to a browser. */
export function isSecretKey(key: string): boolean {
  return key.startsWith('sb_secret_') || jwtRole(key) === 'service_role';
}

export function readBackendConfig(env: Readonly<Record<string, unknown>> | undefined): BackendConfig | null {
  if (!env) return null;
  const url = String(env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = String(env.VITE_SUPABASE_KEY ?? '').trim();
  if (!url || !key || isSecretKey(key)) return null;
  try {
    const u = new URL(url);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
  } catch {
    return null;
  }
  return { url, key };
}
