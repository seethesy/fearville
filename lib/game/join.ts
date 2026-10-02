import { database } from '@/db';
import { newPlayer } from './types';
import { requireThat, log } from './engine';
import { read, cookieName } from './store';

export const memberExpiry = () => Date.now() + 1000 * 60 * 60 * 24 * 30;
export function memberCookie(r: Request, token: string) {
  return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`;
}

// Seats a new player at a lobby table under a fresh member credential.
// Shared by the public join form and by invitation acceptance so both paths
// enforce the same lobby, capacity, and unique-name rules. Returns false when
// concurrent joins kept changing the table (the caller reports 409).
export async function joinSession(
  code: string,
  name: string,
  tokenHash: string,
) {
  requireThat(/^[A-Z]{6}$/.test(code), 'Enter a six-letter code.');
  const db = database();
  for (let i = 0; i < 8; i++) {
    const { game, version } = await read(code);
    requireThat(!game.sandbox, 'Sandbox sessions do not accept live players.');
    requireThat(
      game.phase === 'lobby',
      'This game has started. Use your recovery key to reconnect.',
    );
    requireThat(game.players.length < 15, 'This table is full.');
    requireThat(
      !game.players.some((p) => p.name.toLowerCase() === name.toLowerCase()),
      'That name is taken. Use a different name, or restore your session.',
    );
    const player = newPlayer(name, game.players.length + 1);
    game.players.push(player);
    log(game, name + ' joined the table.', Date.now(), true);
    const results = await db.batch([
      db
        .prepare(
          'UPDATE sessions SET state = ?, version = version + 1 WHERE code = ? AND version = ?',
        )
        .bind(JSON.stringify(game), code, version),
      db
        .prepare(
          'INSERT INTO members (token_hash,code,player,host,expires) SELECT ?,?,?,0,? WHERE changes() = 1',
        )
        .bind(tokenHash, code, player.id, memberExpiry()),
    ]);
    if (results[0].meta.changes === 1) return true;
  }
  return false;
}
