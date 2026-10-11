import { database } from '@/db';
import type { Actor, Game } from './types';
import { savedGame } from './saved-state';
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
export async function authMember(
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
export async function auth(r: Request): Promise<{ actor: Actor; code: string }> {
  const { actor, code } = await authMember(r);
  const { game } = await read(code);
  if (
    !actor.host &&
    !game.players.some((p) => p.id === actor.id && !p.departed)
  )
    throw Error('AUTH');
  return { actor, code };
}
export async function authenticatedRead(r: Request) {
  const token = tokenOf(r);
  if (!token || token.length > 200) throw Error('AUTH');
  const row = await database()
    .prepare(
      'SELECT m.code, m.player, m.host, s.state, s.version, s.created FROM members m JOIN sessions s ON s.code = m.code WHERE m.token_hash = ? AND m.expires > ?',
    )
    .bind(await hash(token), Date.now())
    .first<{
      code: string;
      player: string;
      host: number;
      state: string;
      version: number;
      created: number;
    }>();
  if (!row) throw Error('AUTH');
  const game = savedGame(row.state);
  const actor = { id: row.player, host: !!row.host };
  if (!actor.host && !game.players.some((p) => p.id === actor.id && !p.departed))
    throw Error('AUTH');
  return { actor, code: row.code, game, version: row.version, created: row.created };
}
export async function read(code: string) {
  const row = await database()
    .prepare('SELECT state, version, created FROM sessions WHERE code = ?')
    .bind(code)
    .first<{ state: string; version: number; created: number }>();
  if (!row) throw Error('Session not found.');
  return {
    game: savedGame(row.state),
    version: row.version,
    created: row.created,
  };
}
export async function save(g: Game, version: number, syncRanked = true) {
  const state = JSON.stringify(g);
  if (state.length > 8_000_000)
    throw Error(
      'Session storage is full. End this session and create another.',
    );
  const db = database();
  const update = db
    .prepare(
      'UPDATE sessions SET state = ?, version = version + 1 WHERE code = ? AND version = ?',
    )
    .bind(state, g.code, version);
  // Puzzle moves cannot change ranked membership. Keep their CAS write to one
  // statement instead of rebuilding locks for every seat on every move.
  if (!syncRanked) return (await update.run()).meta.changes === 1;
  const guard =
    'EXISTS (SELECT 1 FROM sessions WHERE code=? AND version=? AND state=?)';
  const lockStatements: D1PreparedStatement[] = [];
  if (g.phase === 'lobby' || !g.ranked) {
    lockStatements.push(
      db
        .prepare(`DELETE FROM ranked_seats WHERE code=? AND ${guard}`)
        .bind(g.code, g.code, version + 1, state),
    );
  } else if (g.progression?.ranked) {
    for (const seat of g.progression.seats) {
      if (!seat.account) continue;
      lockStatements.push(
        db
          .prepare(
            `INSERT INTO ranked_seats (account,code,game) SELECT ?,?,? WHERE ${guard} AND (?<>'ended' OR NOT EXISTS (SELECT 1 FROM games WHERE id=?)) ON CONFLICT(account) DO UPDATE SET game=excluded.game WHERE ranked_seats.code=excluded.code`,
          )
          .bind(
            seat.account,
            g.code,
            `${g.code}:${g.gameStartedAt}`,
            g.code,
            version + 1,
            state,
            g.phase,
            `${g.code}:${g.gameStartedAt}`,
          ),
      );
      // A conflicting account must fail the entire batch, including the CAS.
      lockStatements.push(
        db
          .prepare(
            `INSERT INTO ranked_seats (account,code,game) SELECT ?,?,? WHERE ${guard} AND EXISTS (SELECT 1 FROM ranked_seats WHERE account=? AND code<>?)`,
          )
          .bind(
            seat.account,
            g.code,
            `${g.code}:${g.gameStartedAt}`,
            g.code,
            version + 1,
            state,
            seat.account,
            g.code,
          ),
      );
    }
  }
  try {
    const results = await db.batch([update, ...lockStatements]);
    return results[0].meta.changes === 1;
  } catch (error) {
    if (String(error).includes('ranked_seats.account'))
      throw Error(
        'A participant is already playing another ranked game. Finish that game first.',
      );
    throw error;
  }
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
          'Your session has expired. Join again or open your account’s saved lobbies.',
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
