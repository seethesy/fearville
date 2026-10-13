import { checkSeatAccount } from '@/lib/admin/access';
import { requirePlayerRequest } from '@/lib/accounts/service';
import { database } from '@/db';
import type { Actor, Command, Game } from './types';
import type { ScopedUpdate } from './scoped-update';
import { table } from './table-client';
import {
  SESSION_COLUMNS,
  loadStored,
  prepareWrite,
  runWrite,
  saveIndependentParts,
  type SessionRow,
} from './part-store';
export const cookieName = 'ct_session';
// Checked in the same SQLite write as the game change. Revocation cannot race
// a previously authenticated request into committing after a ban/host transfer.
const communicationGuard = `NOT EXISTS (SELECT 1 FROM members m JOIN account_seats seat ON seat.code=m.code AND seat.player=m.player JOIN accounts a ON a.id=seat.account WHERE m.token_hash=? AND a.muted_until>?)`;
const credentialGuard = `EXISTS (SELECT 1 FROM members m WHERE m.token_hash=? AND m.code=sessions.code AND m.expires>? AND NOT EXISTS (SELECT 1 FROM account_seats seat JOIN accounts a ON a.id=seat.account WHERE seat.code=m.code AND seat.player=m.player AND (a.role<>'player' OR a.banned IS NOT NULL)))`;

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
  await requirePlayerRequest(r);
  await checkSeatAccount(member.code, member.player);
  return {
    actor: {
      id: member.player,
      host: !!member.host,
      credentialHash: await hash(token),
    },
    code: member.code,
  };
}
export async function auth(
  r: Request,
): Promise<{ actor: Actor; code: string }> {
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
  const { actor, code } = await authMember(r);
  const { game, version, created } = await table(code).read(code, actor);
  return { actor, code, game, version, created };
}
export async function read(code: string) {
  return table(code).read(code);
}
export async function readD1(code: string) {
  const row = await database()
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.code = ?`,
    )
    .bind(code)
    .first<SessionRow>();
  if (!row) throw Error('Session not found.');
  return converted(row);
}
// Older single-blob rows are split into parts the first time they load.
// If another request wins the race, that request converts it instead.
async function converted(row: SessionRow) {
  const { game, version, created, legacy } = loadStored(row);
  if (legacy && (await saveD1(game, version, false)))
    return { game, version: version + 1, created };
  return { game, version, created };
}
export async function saveD1(
  g: Game,
  version: number,
  syncRanked = true,
  credentialHash?: string,
  communication = false,
  extra?: (guard: string, bindings: [string, string]) => D1PreparedStatement[],
  writeId?: string,
) {
  const db = database();
  const write = prepareWrite(
    db,
    g,
    version,
    credentialHash
      ? ' AND ' +
          credentialGuard +
          (communication ? ' AND ' + communicationGuard : '')
      : '',
    credentialHash
      ? [
          credentialHash,
          Date.now(),
          ...(communication ? [credentialHash, Date.now()] : []),
        ]
      : [],
    writeId,
  );
  // Puzzle moves cannot change ranked membership. Keep their CAS write small
  // instead of rebuilding locks for every seat on every move.
  const guard = write.guard;
  const lockStatements: D1PreparedStatement[] = [];
  if (syncRanked && (g.phase === 'lobby' || !g.ranked)) {
    lockStatements.push(
      db
        .prepare(`DELETE FROM ranked_seats WHERE code=? AND ${guard}`)
        .bind(g.code, ...write.guardBindings),
    );
  } else if (syncRanked && g.progression?.ranked) {
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
            ...write.guardBindings,
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
            ...write.guardBindings,
            seat.account,
            g.code,
          ),
      );
    }
  }
  try {
    const results = await runWrite(db, write, [], [...lockStatements, ...(extra?.(write.guard, write.guardBindings) ?? [])]);
    return !!results && results[0].meta.changes === 1;
  } catch (error) {
    if (String(error).includes('ranked_seats.account'))
      throw Error(
        'A participant is already playing another ranked game. Finish that game first.',
      );
    throw error;
  }
}
export async function loadDecision(g: Game, command: Command) {
  if (command.action !== 'undo' && command.action !== 'rewind') return;
  const entry =
    command.action === 'undo'
      ? g.history.at(-1)
      : g.history.find((h) => h.id === command.history);
  if (!entry || entry.before) return;
  const row = await database()
    .prepare('SELECT state FROM session_snapshots WHERE code=? AND id=?')
    .bind(g.code, entry.id)
    .first<{ state: string }>();
  if (!row) throw Error('This saved decision is no longer available.');
  entry.before = row.state;
}
/** Save a chat message, notebook or vigil move as its own stored part. */
export async function saveIndependent(
  g: Game,
  update: ScopedUpdate,
  credentialHash?: string,
) {
  return saveIndependentParts(
    database(),
    g,
    update,
    credentialHash
      ? ' AND ' +
          credentialGuard +
          (update.append ? ' AND ' + communicationGuard : '')
      : '',
    credentialHash
      ? [
          credentialHash,
          Date.now(),
          ...(update.append ? [credentialHash, Date.now()] : []),
        ]
      : [],
  );
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
  if (
    message === 'FORBIDDEN' ||
    message === 'ADMIN_GAMEPLAY' ||
    message === 'BANNED'
  )
    return json(
      {
        error:
          message === 'BANNED'
            ? 'This account is banned.'
            : message === 'ADMIN_GAMEPLAY'
              ? 'Admin accounts cannot participate in games.'
              : 'Admin access required.',
      },
      403,
    );
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
