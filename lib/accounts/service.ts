import { adminAllowlist, requirePlayerAccount } from '@/lib/admin/access';
import {
  adminSessionValid,
  ADMIN_SESSION_MS,
  allowlisted,
} from '@/lib/admin/policy';
import { env } from 'cloudflare:workers';
import { database } from '@/db';
import { hash, tokenOf } from '@/lib/game/store';
import { random, appleSecret, decryptToken, type Provider } from './oidc';
import { linkSeatRecords } from '@/lib/social/results';
import { pendingCounts } from '@/lib/social/pending';
import { profileDefaults } from './profile';
import { runtimeOrigin } from '@/lib/runtime/config';
export const accountCookie = 'ct_account';
export const origin = runtimeOrigin(env as unknown as Record<string, unknown>);
const siteOrigins = [origin, 'https://staging.fearville.app'];
/** Public origin for this request: staging when served from staging, else production. */
export function siteOrigin(r: Request) {
  const own = new URL(r.url).origin;
  return siteOrigins.includes(own) ? own : origin;
}
export function config(key: string) {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}
export function enabled(provider: Provider) {
  return provider === 'google'
    ? !!(config('GOOGLE_CLIENT_ID') && config('GOOGLE_CLIENT_SECRET'))
    : !!(
        config('APPLE_SERVICES_ID') &&
        config('APPLE_TEAM_ID') &&
        config('APPLE_KEY_ID') &&
        config('APPLE_PRIVATE_KEY') &&
        config('AUTH_ENCRYPTION_KEY')
      );
}
export function cookie(
  name: string,
  value: string,
  maxAge = 2592000,
  none = false,
) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=${none ? 'None' : 'Lax'}; Path=/; Max-Age=${maxAge}`;
}
export function readCookie(r: Request, name: string) {
  return (
    r.headers
      .get('cookie')
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + '='))
      ?.slice(name.length + 1) || ''
  );
}
export function accountToken(r: Request) {
  return (
    r.headers.get('x-account-authorization')?.replace(/^Bearer /, '') ||
    readCookie(r, accountCookie)
  );
}
/**
 * The signed-in account. While the admin browses the normal UI (FEAR-158)
 * this is the account being viewed (null for a guest) and only reads are
 * allowed; pass `real` for admin endpoints that act as the admin itself.
 */
export async function accountAuth(r: Request, real = false) {
  const token = accountToken(r);
  if (!token || token.length > 200) return null;
  const sessionHash = await hash(token);
  const a = await database()
    .prepare(
      'SELECT a.id,a.name,a.email,a.handle,a.handle_changed_at AS handleChangedAt,a.role,a.google_email AS googleEmail,a.banned,s.provider,s.verified_email AS verifiedEmail,s.issued,s.expires FROM accounts a JOIN account_sessions s ON a.id=s.account WHERE s.hash=?',
    )
    .bind(sessionHash)
    .first<{
      id: string;
      name: string;
      email: string;
      handle: string | null;
      handleChangedAt: number | null;
      role: string;
      googleEmail: string | null;
      banned: string | null;
      provider: string | null;
      verifiedEmail: string | null;
      issued: number;
      expires: number;
    }>();
  if (!a) return null;
  if (a.banned !== null) throw Error('BANNED');
  if (a.expires <= Date.now()) return null;
  const elevated = adminSessionValid(a, adminAllowlist(), Date.now());
  if (a.role === 'admin' && !elevated) return null;
  if (elevated && !real) {
    const viewed = await adminViewAccount(sessionHash, a.id);
    if (viewed !== undefined) {
      if (!readOnlyMethod(r.method)) throw Error('ADMIN_VIEW');
      return viewed;
    }
  }
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    handle: a.handle,
    handleChangedAt: a.handleChangedAt,
    role: elevated ? ('admin' as const) : ('player' as const),
  };
}
const readOnlyMethod = (method: string) => method === 'GET' || method === 'HEAD';

/** FEAR-158: the admin session's current view, or undefined when not browsing. */
export async function adminView(sessionHash: string, admin: string) {
  return (
    (await database()
      .prepare(
        'SELECT viewer,account FROM admin_views WHERE session=? AND admin=?',
      )
      .bind(sessionHash, admin)
      .first<{ viewer: string; account: string | null }>()) ?? undefined
  );
}

/** Undefined: not browsing. Null: browsing as a guest. Otherwise the viewed account. */
async function adminViewAccount(sessionHash: string, admin: string) {
  const view = await adminView(sessionHash, admin);
  if (!view) return undefined;
  if (!view.account) return null;
  const v = await database()
    .prepare(
      "SELECT id,name,email,handle,handle_changed_at AS handleChangedAt FROM accounts WHERE id=? AND role='player' AND banned IS NULL",
    )
    .bind(view.account)
    .first<{
      id: string;
      name: string;
      email: string;
      handle: string | null;
      handleChangedAt: number | null;
    }>();
  return v ? { ...v, role: 'player' as const } : null;
}

/** FEAR-158: what the UI needs to draw the ADMIN VIEW banner. */
export async function adminViewState(r: Request) {
  const token = accountToken(r);
  if (!token || token.length > 200) return undefined;
  // One primary-key lookup for everyone; only a hit re-checks the admin session.
  const sessionHash = await hash(token);
  const row = await database()
    .prepare('SELECT admin FROM admin_views WHERE session=?')
    .bind(sessionHash)
    .first<{ admin: string }>();
  if (!row) return undefined;
  const admin = await accountAuth(r, true);
  if (admin?.role !== 'admin' || admin.id !== row.admin) return undefined;
  const view = await adminView(sessionHash, admin.id);
  return view ? { viewer: view.viewer } : undefined;
}

export async function requirePlayerRequest(r: Request) {
  const token = accountToken(r);
  if (!token || token.length > 200) return;
  const seat = await database()
    .prepare('SELECT account FROM account_sessions WHERE hash=?')
    .bind(await hash(token))
    .first<{ account: string }>();
  if (seat) await requirePlayerAccount(seat.account);
}
export async function createAccountSession(
  account: string,
  provider = '',
  verifiedEmail = '',
) {
  const a = await database()
    .prepare('SELECT role,google_email,banned FROM accounts WHERE id=?')
    .bind(account)
    .first<{
      role: string;
      google_email: string | null;
      banned: string | null;
    }>();
  if (!a || a.banned !== null) throw Error('BANNED');
  if (
    a.role === 'admin' &&
    (provider !== 'google' ||
      a.google_email !== verifiedEmail ||
      !allowlisted(verifiedEmail, adminAllowlist()))
  )
    throw Error('Admin access requires verified Google sign-in.');
  const lifetime = a.role === 'admin' ? ADMIN_SESSION_MS : 30 * 86400000;
  const token = random();
  await database()
    .prepare(
      'INSERT INTO account_sessions (hash,account,expires,provider,verified_email,issued) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      await hash(token),
      account,
      Date.now() + lifetime,
      provider,
      verifiedEmail,
      Date.now(),
    )
    .run();
  return token;
}
export async function attachSeat(r: Request, account: string) {
  const member = tokenOf(r);
  if (!member) return;
  await attachMember(await hash(member), account);
}
export async function attachMember(memberHash: string, account: string) {
  await requirePlayerAccount(account);
  await database()
    .prepare(
      'INSERT INTO account_seats (id,account,code,player,host) SELECT code || char(58) || player,?,code,player,host FROM members WHERE token_hash=? AND expires>? ON CONFLICT(id) DO NOTHING',
    )
    .bind(account, memberHash, Date.now())
    .run();
  // A seat attached after its game ended still counts toward the account.
  await linkSeatRecords(account);
}
export async function accountView(r: Request) {
  const account = await accountAuth(r);
  const providers = { google: enabled('google'), apple: enabled('apple') };
  if (!account)
    return {
      account: null,
      providers,
      connections: [],
      seats: [],
      pending: { requests: 0, invites: 0 },
    };
  if (account.role === 'admin')
    return {
      account,
      providers: { google: providers.google, apple: false },
      connections: ['google'],
      seats: [],
      pending: { requests: 0, invites: 0 },
    };
  const connections = await database()
    .prepare('SELECT provider FROM identities WHERE account=?')
    .bind(account.id)
    .all<{ provider: string }>();
  const seats = await database()
    .prepare(
      "SELECT a.id,a.code,a.player,a.host,json_extract(s.state,'$.phase') AS phase,json_extract(s.state,'$.hostName') AS hostName FROM account_seats a JOIN sessions s ON a.code=s.code WHERE a.account=? ORDER BY s.created DESC LIMIT 50",
    )
    .bind(account.id)
    .all<{
      id: string;
      code: string;
      player: string;
      host: number;
      phase: string;
      hostName: string;
    }>();
  return {
    account,
    warning: (
      await database()
        .prepare(
          "SELECT resolution FROM player_reports WHERE target_account=? AND status='actioned' AND resolution LIKE 'warn:%' ORDER BY resolved_at DESC LIMIT 1",
        )
        .bind(account.id)
        .first<{ resolution: string }>()
    )?.resolution.slice(6),
    items: (
      await database()
        .prepare('SELECT item FROM account_items WHERE account=? ORDER BY item')
        .bind(account.id)
        .all<{ item: string }>()
    ).results.map((x) => x.item),
    profile: await profileDefaults(account.id, account.name),
    providers,
    connections: connections.results.map((c) => c.provider),
    seats: seats.results,
    pending: await pendingCounts(account.id, Date.now()),
  };
}
export async function clientSecret(provider: Provider) {
  return provider === 'google'
    ? config('GOOGLE_CLIENT_SECRET')
    : appleSecret(
        config('APPLE_SERVICES_ID'),
        config('APPLE_TEAM_ID'),
        config('APPLE_KEY_ID'),
        config('APPLE_PRIVATE_KEY'),
      );
}
export function clientID(provider: Provider) {
  return config(
    provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'APPLE_SERVICES_ID',
  );
}
export function callbackURL(provider: Provider, r: Request) {
  return siteOrigin(r) + '/api/accounts/callback/' + provider;
}
export async function revokeApple(account: string) {
  const row = await database()
    .prepare(
      'SELECT refresh_token FROM identities WHERE account=? AND provider=?',
    )
    .bind(account, 'apple')
    .first<{ refresh_token: string | null }>();
  if (!row?.refresh_token) return;
  const refresh = await decryptToken(
    row.refresh_token,
    config('AUTH_ENCRYPTION_KEY'),
  );
  const response = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientID('apple'),
      client_secret: await clientSecret('apple'),
      token: refresh,
      token_type_hint: 'refresh_token',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw Error(
      'Apple could not disconnect your account. Please try deletion again shortly.',
    );
}
