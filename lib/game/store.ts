import { database } from '@/db';
import type { Actor, Game } from './types';
export const cookieName = 'ct_session';
export async function hash(token: string) {
  const data = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(data), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function tokenOf(r: Request) {
  return (
    r.headers.get('authorization')?.replace(/^Bearer /, '') ||
    r.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) ||
    ''
  );
}
export async function auth(
  r: Request,
): Promise<{ actor: Actor; code: string }> {
  const token = tokenOf(r);
  if (!token || token.length > 200) throw Error('AUTH');
  const member = await database()
    .prepare(
      'SELECT code, player, host FROM members WHERE token_hash = ? AND expires > ?',
    )
    .bind(await hash(token), Date.now())
    .first<{ code: string; player: string; host: number }>();
  if (!member) throw Error('AUTH');
  return {
    actor: { id: member.player, host: !!member.host },
    code: member.code,
  };
}
export async function read(code: string) {
  const row = await database()
    .prepare('SELECT state, version, created FROM sessions WHERE code = ?')
    .bind(code)
    .first<{ state: string; version: number; created: number }>();
  if (!row) throw Error('Session not found.');
  return {
    game: JSON.parse(row.state) as Game,
    version: row.version,
    created: row.created,
  };
}
export async function save(g: Game, version: number) {
  const state = JSON.stringify(g);
  if (state.length > 8_000_000)
    throw Error(
      'Session storage is full. End this session and create another.',
    );
  const r = await database()
    .prepare(
      'UPDATE sessions SET state = ?, version = version + 1 WHERE code = ? AND version = ?',
    )
    .bind(state, g.code, version)
    .run();
  return r.meta.changes === 1;
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}
export function errorResponse(e: unknown) {
  const message = e instanceof Error ? e.message : 'Request failed.';
  if (message === 'AUTH')
    return json(
      {
        error:
          'Your session has expired. Join again or restore with your recovery key.',
      },
      401,
    );
  if (message.startsWith('D1_') || message.includes('SQLITE')) {
    console.error(message);
    return json(
      {
        error:
          'The session service is temporarily unavailable. Please try again.',
      },
      503,
    );
  }
  return json({ error: message }, 400);
}
export function checkOrigin(r: Request) {
  const origin = r.headers.get('origin');
  if (origin && origin !== new URL(r.url).origin)
    throw Error('Cross-origin requests are not allowed.');
}
export async function limited(r: Request, kind: string, limit: number) {
  const now = Date.now(),
    window = Math.floor(now / 60000),
    ip = r.headers.get('cf-connecting-ip') || 'local';
  const key = await hash(ip + ':' + kind + ':' + window);
  const db = database();
  const row = await db
    .prepare(
      'INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count',
    )
    .bind(key, now + 120000)
    .first<{ count: number }>();
  if ((row?.count || 0) > limit)
    throw Error('Too many attempts. Wait a minute and try again.');
  if (Math.random() < 0.03)
    await db
      .prepare('DELETE FROM rate_limits WHERE expires < ?')
      .bind(now)
      .run();
}
