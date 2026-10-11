import { database } from '@/db';
import { newPlayer, MAX_PLAYERS } from './types';
import { assignAvatars, availableAvatar } from './avatars';
import type { ProfileDefaults } from '@/lib/accounts/preferences';
import type { DeathEffectId } from './cosmetics';
import { requireThat, log } from './engine';
import { read, cookieName } from './store';

export const memberExpiry = () => Date.now() + 1000 * 60 * 60 * 24 * 30;
export function memberCookie(r: Request, token: string) {
  return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`;
}

// Seats a new player at a lobby table under a fresh member credential.
// Shared by the public join form and by invitation acceptance so both paths
// enforce the same lobby, capacity, and avatar rules. Returns false when
// concurrent joins kept changing the table (the caller reports 409).
export async function joinSession(
  code: string,
  name: string,
  tokenHash: string,
  invitation?: { id: string; account: string; sender: string; now: number },
  defaults?: ProfileDefaults,
) {
  requireThat(
    /^(?:[0-9]{6}|[A-Z]{6})$/.test(code),
    'Enter a 6-digit session code.',
  );
  const db = database();
  for (let i = 0; i < 8; i++) {
    const { game, version } = await read(code);
    requireThat(!game.sandbox, 'Sandbox sessions do not accept live players.');
    requireThat(
      game.phase === 'lobby',
      'This game has started. Rejoin from your account’s saved lobbies.',
    );
    requireThat(game.players.length < MAX_PLAYERS, 'This table is full.');
    assignAvatars(game.players);
    const player = newPlayer(name, 0);
    if (defaults) {
      player.avatar = availableAvatar(defaults.avatar, game.players);
      player.deathEffect = defaults.deathEffect as DeathEffectId;
    }
    game.players.push(player);
    assignAvatars(game.players);
    log(game, name + ' joined the table.', Date.now(), true);
    const inviteGuard = invitation
      ? " AND EXISTS (SELECT 1 FROM session_invites i WHERE i.id=? AND i.recipient=? AND i.sender=? AND i.code=sessions.code AND i.status='pending' AND i.expires>?) AND EXISTS (SELECT 1 FROM friendships f WHERE f.status='accepted' AND ((f.requester=? AND f.addressee=?) OR (f.requester=? AND f.addressee=?))) AND NOT EXISTS (SELECT 1 FROM friendships b WHERE b.status='blocked' AND ((b.requester=? AND b.addressee=?) OR (b.requester=? AND b.addressee=?))) AND COALESCE((SELECT game_invites FROM account_settings WHERE account=?),'friends')='friends' AND NOT EXISTS (SELECT 1 FROM account_seats WHERE account=? AND code=sessions.code)"
      : '';
    const inviteBindings = invitation
      ? [
          invitation.id,
          invitation.account,
          invitation.sender,
          invitation.now,
          invitation.account,
          invitation.sender,
          invitation.sender,
          invitation.account,
          invitation.account,
          invitation.sender,
          invitation.sender,
          invitation.account,
          invitation.account,
          invitation.account,
        ]
      : [];
    const statements = [
      db
        .prepare(
          'UPDATE sessions SET state = ?, version = version + 1 WHERE code = ? AND version = ?' +
            inviteGuard,
        )
        .bind(JSON.stringify(game), code, version, ...inviteBindings),
      db
        .prepare(
          'INSERT INTO members (token_hash,code,player,host,expires) SELECT ?,?,?,0,? WHERE changes() = 1',
        )
        .bind(tokenHash, code, player.id, memberExpiry()),
    ];
    if (invitation)
      statements.push(
        db
          .prepare(
            'INSERT INTO account_seats (id,account,code,player,host) SELECT code || char(58) || player,?,code,player,host FROM members WHERE token_hash=?',
          )
          .bind(invitation.account, tokenHash),
        db
          .prepare(
            "UPDATE session_invites SET status='accepted' WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM members WHERE token_hash=?)",
          )
          .bind(invitation.id, tokenHash),
      );
    const results = await db.batch(statements);
    if (results[0].meta.changes === 1) return true;
    if (invitation) {
      const waiting = await db
        .prepare(
          "SELECT 1 AS present FROM session_invites WHERE id=? AND status='pending' AND expires>?",
        )
        .bind(invitation.id, Date.now())
        .first();
      requireThat(waiting, 'That invitation is no longer open.');
    }
  }
  return false;
}
