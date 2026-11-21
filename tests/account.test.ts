import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ACCOUNT_SCHEMA, AccountService, RESEND_COOLDOWN_MS } from '../src/backend/account.ts';
import { AuthError, SupabaseAuthApi, isValidCode, isValidEmail, parseSession, type FetchLike } from '../src/backend/authApi.ts';
import { isSecretKey, readBackendConfig, type BackendConfig } from '../src/backend/config.ts';
import { LocalStore, createMemoryBackend } from '../src/storage/storage.ts';

const CONFIG: BackendConfig = { url: 'https://demo.supabase.co', key: 'sb_publishable_test' };

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

/** Tiny fake Supabase Auth server: one valid code, one valid refresh token at a time. */
function fakeServer(opts: { code?: string; status?: number; offline?: boolean } = {}) {
  const calls: Call[] = [];
  let refreshToken = 'r1';
  let n = 1;
  const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const session = () => {
    refreshToken = `r${++n}`;
    return { access_token: `a${n}`, refresh_token: refreshToken, expires_in: 3600, user: { id: 'user-123', email: 'driver@example.com' } };
  };
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    if (opts.offline) throw new TypeError('Failed to fetch');
    if (opts.status) return reply(opts.status, { msg: 'nope' });
    const path = url.slice(CONFIG.url.length);
    const body = calls.at(-1)?.body as Record<string, string> | undefined;
    if (path === '/auth/v1/otp') return reply(200, {});
    if (path === '/auth/v1/verify') return body?.token === (opts.code ?? '123456') ? reply(200, session()) : reply(403, { error_code: 'otp_expired' });
    if (path.startsWith('/auth/v1/token')) return body?.refresh_token === refreshToken ? reply(200, session()) : reply(400, { error_code: 'refresh_token_not_found' });
    if (path === '/auth/v1/logout') return reply(204, null);
    return reply(404, null);
  };
  return { fetch, calls, setRefresh: (t: string) => (refreshToken = t) };
}

test('backend config: off without values, refuses secret keys and plain http', () => {
  assert.equal(readBackendConfig(undefined), null);
  assert.equal(readBackendConfig({}), null);
  assert.equal(readBackendConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_KEY: '' }), null);
  assert.deepEqual(readBackendConfig({ VITE_SUPABASE_URL: ' https://x.supabase.co/ ', VITE_SUPABASE_KEY: 'sb_publishable_abc' }), { url: 'https://x.supabase.co', key: 'sb_publishable_abc' });
  assert.equal(readBackendConfig({ VITE_SUPABASE_URL: 'http://x.supabase.co', VITE_SUPABASE_KEY: 'k' }), null);
  assert.equal(readBackendConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_KEY: 'k' }), null);
  assert.ok(readBackendConfig({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_KEY: 'k' }));
  // Secret keys must never be shipped.
  assert.equal(readBackendConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_KEY: 'sb_secret_abc' }), null);
  const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
  assert.equal(isSecretKey(jwt('service_role')), true);
  assert.equal(isSecretKey(jwt('anon')), false);
  assert.equal(readBackendConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_KEY: jwt('service_role') }), null);
});

test('e-mail and code validation', () => {
  assert.ok(isValidEmail(' Driver@Example.com '));
  for (const bad of ['', 'driver', 'a@b', 'a b@c.cz', `${'x'.repeat(250)}@a.cz`]) assert.equal(isValidEmail(bad), false, bad);
  assert.ok(isValidCode('123456'));
  assert.ok(isValidCode('123 456'));
  assert.ok(isValidCode('1234567890'));
  for (const bad of ['', '12345', 'abcdef', '12345678901']) assert.equal(isValidCode(bad), false, bad);
});

test('parseSession accepts Supabase token responses and rejects odd shapes', () => {
  const s = parseSession({ access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'u', email: 'e@x.cz' } }, 1000);
  assert.deepEqual(s, { accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 3600_000, user: { id: 'u', email: 'e@x.cz' } });
  assert.equal(parseSession({ access_token: 'a', refresh_token: 'r', expires_at: 50, user: { id: 'u' } }, 0)?.expiresAt, 50_000);
  assert.equal(parseSession({ access_token: 'a', user: { id: 'u' } }, 0), null);
  assert.equal(parseSession(null, 0), null);
});

test('auth api: correct endpoints, headers and error mapping', async () => {
  const srv = fakeServer();
  const api = new SupabaseAuthApi(CONFIG, srv.fetch, () => 0);
  await api.requestCode(' Driver@Example.com ');
  assert.equal(srv.calls[0]?.url, 'https://demo.supabase.co/auth/v1/otp');
  assert.deepEqual(srv.calls[0]?.body, { email: 'driver@example.com', create_user: true });
  assert.equal(srv.calls[0]?.headers.apikey, CONFIG.key);
  await assert.rejects(api.verifyCode('driver@example.com', '000000'), (e: unknown) => e instanceof AuthError && e.code === 'invalid-code');
  const s = await api.verifyCode('driver@example.com', '123 456');
  assert.equal(s.user.id, 'user-123');
  assert.deepEqual(srv.calls.at(-1)?.body, { type: 'email', email: 'driver@example.com', token: '123456' });
  await api.signOut(s.accessToken);
  assert.equal(srv.calls.at(-1)?.headers.Authorization, `Bearer ${s.accessToken}`);

  await assert.rejects(new SupabaseAuthApi(CONFIG, fakeServer({ status: 429 }).fetch).requestCode('a@b.cz'), (e: unknown) => e instanceof AuthError && e.code === 'rate-limited');
  await assert.rejects(new SupabaseAuthApi(CONFIG, fakeServer({ status: 503 }).fetch).requestCode('a@b.cz'), (e: unknown) => e instanceof AuthError && e.code === 'server');
  await assert.rejects(new SupabaseAuthApi(CONFIG, fakeServer({ offline: true }).fetch).requestCode('a@b.cz'), (e: unknown) => e instanceof AuthError && e.code === 'network');
  // Invalid input never reaches the network.
  const quiet = fakeServer();
  await assert.rejects(new SupabaseAuthApi(CONFIG, quiet.fetch).requestCode('nope'), (e: unknown) => e instanceof AuthError && e.code === 'invalid-email');
  assert.equal(quiet.calls.length, 0);
});

test('account: without a backend nothing is ever sent', async () => {
  const srv = fakeServer();
  const acc = new AccountService(null, new LocalStore(createMemoryBackend()), { fetch: srv.fetch });
  assert.equal(acc.store.get().status, 'unavailable');
  assert.equal(await acc.requestCode('driver@example.com'), false);
  assert.equal(await acc.accessToken(), null);
  assert.equal(srv.calls.length, 0);
});

test('account: e-mail → code → signed in, persisted, then sign out', async () => {
  let now = 1_000_000;
  const srv = fakeServer();
  const backend = createMemoryBackend();
  const acc = new AccountService(CONFIG, new LocalStore(backend), { fetch: srv.fetch, now: () => now });
  assert.equal(acc.store.get().status, 'signed-out');

  assert.equal(await acc.requestCode('bad'), false);
  assert.equal(acc.store.get().error, 'invalid-email');
  assert.equal(await acc.requestCode('Driver@Example.com'), true);
  assert.equal(acc.store.get().status, 'code-sent');
  assert.equal(acc.store.get().email, 'driver@example.com');

  // Resend cooldown.
  assert.equal(acc.canResend(), false);
  assert.equal(await acc.resendCode(), false);
  now += RESEND_COOLDOWN_MS;
  assert.equal(await acc.resendCode(), true);

  assert.equal(await acc.verifyCode('999999'), false);
  assert.equal(acc.store.get().error, 'invalid-code');
  assert.equal(acc.store.get().status, 'code-sent');
  assert.equal(await acc.verifyCode('123456'), true);
  assert.equal(acc.store.get().status, 'signed-in');
  assert.equal(acc.store.get().userId, 'user-123');
  assert.ok(backend.entries.has(ACCOUNT_SCHEMA.key));

  // A new page load restores the session.
  const again = new AccountService(CONFIG, new LocalStore(backend), { fetch: srv.fetch, now: () => now });
  assert.equal(again.store.get().status, 'signed-in');
  assert.equal(again.store.get().email, 'driver@example.com');

  await again.signOut();
  assert.equal(again.store.get().status, 'signed-out');
  assert.equal(backend.entries.has(ACCOUNT_SCHEMA.key), false);
  assert.ok(srv.calls.some((c) => c.url.endsWith('/auth/v1/logout')));
});

test('account: refresh when expired; offline keeps the session, a rejected token signs out', async () => {
  let now = 0;
  const srv = fakeServer();
  const backend = createMemoryBackend();
  const acc = new AccountService(CONFIG, new LocalStore(backend), { fetch: srv.fetch, now: () => now });
  await acc.requestCode('driver@example.com');
  await acc.verifyCode('123456');
  const first = await acc.accessToken();
  assert.ok(first);

  now += 2 * 3600_000; // expired
  const second = await acc.accessToken();
  assert.ok(second && second !== first);

  // Offline at start-up: still signed in (drive works without a connection).
  now += 2 * 3600_000;
  const offline = new AccountService(CONFIG, new LocalStore(backend), { fetch: fakeServer({ offline: true }).fetch, now: () => now });
  await offline.start();
  assert.equal(offline.store.get().status, 'signed-in');

  // Refresh token revoked on the server: signed out with a clear message.
  srv.setRefresh('something-else');
  const revoked = new AccountService(CONFIG, new LocalStore(backend), { fetch: srv.fetch, now: () => now });
  await revoked.start();
  assert.equal(revoked.store.get().status, 'signed-out');
  assert.equal(revoked.store.get().error, 'session-expired');
  assert.equal(backend.entries.has(ACCOUNT_SCHEMA.key), false);
});

test('account schema: corrupt or partial data falls back to signed out', () => {
  const d = ACCOUNT_SCHEMA.defaults();
  assert.deepEqual(ACCOUNT_SCHEMA.sanitize({ session: { accessToken: 'a' } }, d), d);
  assert.deepEqual(ACCOUNT_SCHEMA.sanitize('x', d), d);
  const ok = ACCOUNT_SCHEMA.sanitize({ session: { accessToken: 'a', refreshToken: 'r', expiresAt: 5, user: { id: 'u', email: 'e' } } }, d);
  assert.equal(ok.session?.user.id, 'u');
});

test('no secret key names and no SDK in the frontend build inputs', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert.match(wf, /VITE_SUPABASE_URL: \$\{\{ vars\.SUPABASE_URL \}\}/);
  assert.match(wf, /VITE_SUPABASE_KEY: \$\{\{ vars\.SUPABASE_PUBLISHABLE_KEY \}\}/);
  assert.doesNotMatch(wf, /secrets\.SUPABASE/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(Object.keys(pkg.dependencies).some((d) => d.includes('supabase')), false);
});
