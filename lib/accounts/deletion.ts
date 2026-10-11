// Account deletion (App Store 5.1.1(v), Google Play account deletion policy).
// Everything tied to the account is deleted or anonymised:
// - Deleted (directly or by ON DELETE CASCADE): the account row, identities,
//   sign-in sessions, native codes, OAuth flows, saved seats, friendships and
//   blocks, invitations, settings, profile, tutorial progress, ranked seats,
//   ratings the account received as Storyteller, and tables it hosts.
// - Anonymised: finished-game seats become "Former player" (game_players.account
//   is set to NULL, name replaced); recaps lose the seat's name, photo, notes
//   and messages; ratings the account gave keep only the star value (comment
//   removed, rater moved to a one-off tombstone row) so Storyteller averages
//   stay correct.
import { isPresetAvatar } from '../game/avatars.ts';

export const FORMER_PLAYER = 'Former player';

type Json = unknown;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replace a seat's name in every string, drop its notes and chat messages,
// and reset an uploaded photo to a preset icon. Works on a saved Game or a
// SessionRecap (same field names). Pure: returns a new value.
export function anonymiseSeat(
  value: Json,
  playerId: string,
  name: string,
): Json {
  const trimmed = name.trim();
  const pattern =
    trimmed.length >= 2
      ? new RegExp(
          `(?<![\\p{L}\\p{N}_])${escapeRegExp(trimmed)}(?![\\p{L}\\p{N}_])`,
          'gu',
        )
      : null;
  const walk = (node: Json): Json => {
    if (typeof node === 'string')
      return pattern ? node.replace(pattern, FORMER_PLAYER) : node;
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const object = node as Record<string, Json>;
    const out: Record<string, Json> = {};
    for (const [key, child] of Object.entries(object)) {
      if (key === 'notebooks' && child && typeof child === 'object') {
        const books = { ...(child as Record<string, Json>) };
        delete books[playerId];
        out[key] = walk(books);
      } else if (key === 'messages' && Array.isArray(child)) {
        out[key] = child
          .filter(
            (m) =>
              !(
                m &&
                typeof m === 'object' &&
                (m as { from?: string }).from === playerId
              ),
          )
          .map(walk);
      } else out[key] = walk(child);
    }
    if (out.id === playerId && typeof out.name === 'string') {
      out.name = FORMER_PLAYER;
      if ('notebook' in out) delete out.notebook;
      if (typeof out.avatar === 'string' && !isPresetAvatar(out.avatar))
        out.avatar = 'ghost';
    }
    return out;
  };
  return walk(value);
}

function anonymiseJson(
  text: string,
  seats: { player: string; name: string }[],
) {
  let value: Json = JSON.parse(text);
  for (const seat of seats)
    value = anonymiseSeat(value, seat.player, seat.name);
  return JSON.stringify(value);
}

export async function deleteAccountData(db: D1Database, account: string) {
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  // Finished games: anonymise recap snapshots for every seat this account held.
  const seats = (
    await db
      .prepare(
        'SELECT gp.game AS game, gp.player AS player, gp.name AS name, g.recap AS recap FROM game_players gp JOIN games g ON g.id = gp.game WHERE gp.account = ?',
      )
      .bind(account)
      .all<{
        game: string;
        player: string;
        name: string;
        recap: string | null;
      }>()
  ).results;
  const byGame = new Map<
    string,
    { recap: string; seats: { player: string; name: string }[] }
  >();
  for (const seat of seats) {
    if (!seat.recap) continue;
    const entry = byGame.get(seat.game) ?? { recap: seat.recap, seats: [] };
    entry.seats.push({ player: seat.player, name: seat.name });
    byGame.set(seat.game, entry);
  }
  for (const [game, entry] of byGame)
    statements.push(
      db
        .prepare('UPDATE games SET recap = ? WHERE id = ?')
        .bind(anonymiseJson(entry.recap, entry.seats), game),
    );
  statements.push(
    db
      .prepare(
        'UPDATE game_players SET name = ?, account = NULL WHERE account = ?',
      )
      .bind(FORMER_PLAYER, account),
    db
      .prepare('UPDATE games SET host_name = ? WHERE host_account = ?')
      .bind(FORMER_PLAYER, account),
  );

  // Ratings this account gave: keep the stars, drop the comment and the link.
  const gaveRatings = await db
    .prepare('SELECT 1 FROM storyteller_ratings WHERE rater = ? LIMIT 1')
    .bind(account)
    .first();
  if (gaveRatings) {
    const tombstone = 'former-' + crypto.randomUUID();
    statements.push(
      db
        .prepare(
          'INSERT INTO accounts (id, name, email, created) VALUES (?, ?, ?, ?)',
        )
        .bind(tombstone, FORMER_PLAYER, '', now),
      db
        .prepare(
          "UPDATE storyteller_ratings SET rater = ?, comment = '' WHERE rater = ?",
        )
        .bind(tombstone, account),
    );
  }

  // Tables where this account sits as a player (not host) keep running:
  // anonymise the seat in the live state and in its earlier session recaps.
  const liveSeats = (
    await db
      .prepare(
        'SELECT s.code AS code, s.state AS state, s.version AS version, a.player AS player FROM account_seats a JOIN sessions s ON s.code = a.code WHERE a.account = ? AND a.host = 0',
      )
      .bind(account)
      .all<{ code: string; state: string; version: number; player: string }>()
  ).results;
  for (const seat of liveSeats) {
    const state = JSON.parse(seat.state) as {
      players?: { id: string; name: string }[];
    };
    const name = state.players?.find((p) => p.id === seat.player)?.name;
    if (!name) continue;
    statements.push(
      db
        .prepare(
          'UPDATE sessions SET state = ?, version = version + 1 WHERE code = ? AND version = ?',
        )
        .bind(
          JSON.stringify(anonymiseSeat(state, seat.player, name)),
          seat.code,
          seat.version,
        ),
    );
  }

  statements.push(
    db
      .prepare(
        'DELETE FROM members WHERE EXISTS (SELECT 1 FROM account_seats a WHERE a.account = ? AND a.code = members.code AND a.player = members.player)',
      )
      .bind(account),
    db
      .prepare(
        'DELETE FROM sessions WHERE code IN (SELECT code FROM account_seats WHERE account = ? AND host = 1)',
      )
      .bind(account),
    db.prepare('DELETE FROM oauth_flows WHERE account = ?').bind(account),
    db.prepare('DELETE FROM accounts WHERE id = ?').bind(account),
  );
  await db.batch(statements);
}
