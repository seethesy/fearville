import { env } from 'cloudflare:workers';
import { database } from '@/db';
import { hash, tokenOf } from '@/lib/game/store';
import { random, appleSecret, decryptToken, type Provider } from './oidc';
import { linkSeatRecords } from '@/lib/social/results';
import { pendingCounts } from '@/lib/social/pending';
export const accountCookie = 'ct_account';
export const origin = 'https://fearville.app';
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
export async function accountAuth(r: Request) {
  const token = accountToken(r);
  if (!token || token.length > 200) return null;
  return database()
    .prepare(
      'SELECT a.id,a.name,a.email,a.handle FROM accounts a JOIN account_sessions s ON a.id=s.account WHERE s.hash=? AND s.expires>?',
    )
    .bind(await hash(token), Date.now())
    .first<{
      id: string;
      name: string;
      email: string;
      handle: string | null;
    }>();
}
export async function createAccountSession(account: string) {
  const token = random();
  await database()
    .prepare(
      'INSERT INTO account_sessions (hash,account,expires) VALUES (?,?,?)',
    )
    .bind(await hash(token), account, Date.now() + 30 * 86400000)
    .run();
  return token;
}
export async function attachSeat(r: Request, account: string) {
  const member = tokenOf(r);
  if (!member) return;
  await attachMember(await hash(member), account);
}
export async function attachMember(memberHash: string, account: string) {
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
export function callbackURL(provider: Provider) {
  return origin + '/api/accounts/callback/' + provider;
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
