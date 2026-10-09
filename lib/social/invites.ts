import { database } from '@/db';
import { joinSession } from '@/lib/game/join';
import { read, hash, tokenOf } from '@/lib/game/store';
import { requireThat } from '@/lib/game/engine';
import { uuid } from '@/lib/game/types';
import { areFriends, accountByID, type PublicAccount } from './friends';
import { text } from './derive';
import { privacyFor } from './privacy';

export const inviteLifetime = 24 * 60 * 60 * 1000;

// Membership of a session for social purposes: the device's seat credential
// or a seat saved to the account. Either proves the caller sits at that table.
export async function memberOf(r: Request, account: string, code: string) {
  const db = database();
  const token = tokenOf(r);
  if (token && token.length <= 200) {
    const seat = await db
      .prepare('SELECT code FROM members WHERE token_hash=? AND expires>?')
      .bind(await hash(token), Date.now())
      .first<{ code: string }>();
    if (seat?.code === code) return true;
  }
  return !!(await db
    .prepare('SELECT id FROM account_seats WHERE account=? AND code=?')
    .bind(account, code)
    .first());
}

export async function sendInvite(
  r: Request,
  me: string,
  codeValue: unknown,
  recipient: unknown,
  now: number,
) {
  const code = text(codeValue, 10).toUpperCase();
  requireThat(/^[A-Z]{6}$/.test(code), 'Choose a session.');
  requireThat(
    typeof recipient === 'string' && recipient.length < 100,
    'Choose a friend.',
  );
  requireThat(recipient !== me, 'You are already at this table.');
  requireThat(
    await memberOf(r, me, code),
    'Only players at this table can send invitations.',
  );
  requireThat(
    await areFriends(me, recipient),
    'You can only invite your friends.',
  );
  const { game } = await read(code);
  requireThat(
    (await privacyFor(recipient)).invites === 'friends',
    'This friend has disabled game invitations.',
  );
  requireThat(game.phase === 'lobby', 'This game has already started.');
  requireThat(game.players.length < 15, 'This table is full.');
  const db = database();
  const seated = await db
    .prepare('SELECT id FROM account_seats WHERE account=? AND code=?')
    .bind(recipient, code)
    .first();
  requireThat(!seated, 'That friend is already at this table.');
  await db
    .prepare(
      "INSERT INTO session_invites (id,code,sender,recipient,status,created,expires) SELECT ?,?,?,?,'pending',?,? WHERE COALESCE((SELECT game_invites FROM account_settings WHERE account=?),'friends')='friends' AND EXISTS (SELECT 1 FROM friendships WHERE status='accepted' AND ((requester=? AND addressee=?) OR (requester=? AND addressee=?))) AND NOT EXISTS (SELECT 1 FROM friendships WHERE status='blocked' AND ((requester=? AND addressee=?) OR (requester=? AND addressee=?))) ON CONFLICT(code,recipient) DO UPDATE SET sender=excluded.sender,status='pending',created=excluded.created,expires=excluded.expires WHERE session_invites.status<>'accepted'",
    )
    .bind(
      uuid(),
      code,
      me,
      recipient,
      now,
      now + inviteLifetime,
      recipient,
      me,
      recipient,
      recipient,
      me,
      me,
      recipient,
      recipient,
      me,
    )
    .run();
}

type Invite = {
  id: string;
  code: string;
  sender: string;
  recipient: string;
  status: string;
  expires: number;
};

async function pendingInvite(me: string, id: unknown, now: number) {
  requireThat(
    typeof id === 'string' && id.length < 100,
    'Choose an invitation.',
  );
  const invite = await database()
    .prepare(
      "SELECT id,code,sender,recipient,status,expires FROM session_invites WHERE id=? AND recipient=? AND status='pending' AND expires>?",
    )
    .bind(id, me, now)
    .first<Invite>();
  requireThat(invite, 'That invitation is no longer open.');
  return invite;
}

export async function declineInvite(me: string, id: unknown, now: number) {
  const invite = await pendingInvite(me, id, now);
  await database()
    .prepare("UPDATE session_invites SET status='declined' WHERE id=?")
    .bind(invite.id)
    .run();
}

export async function revokeInvite(me: string, id: unknown) {
  requireThat(
    typeof id === 'string' && id.length < 100,
    'Choose an invitation.',
  );
  await database()
    .prepare(
      "UPDATE session_invites SET status='revoked' WHERE id=? AND sender=? AND status='pending'",
    )
    .bind(id, me)
    .run();
}

// Accepts an invitation by seating the account holder at the table under a
// fresh member credential, which the caller turns into the session cookie.
export async function acceptInvite(
  me: string,
  id: unknown,
  nameValue: unknown,
  now: number,
) {
  const invite = await pendingInvite(me, id, now);
  requireThat(
    await areFriends(me, invite.sender),
    'This invitation is no longer available.',
  );
  requireThat(
    (await privacyFor(me)).invites === 'friends',
    'Game invitations are disabled.',
  );
  const self = await accountByID(me);
  const name = text(nameValue, 32) || text(self?.name, 32) || 'Player';
  requireThat(name, 'Enter your name.');
  const token = uuid() + uuid();
  const tokenHash = await hash(token);
  const joined = await joinSession(invite.code, name, tokenHash, {
    id: invite.id,
    account: me,
    sender: invite.sender,
    now,
  });
  requireThat(joined, 'The table changed. Please try again.');
  return { code: invite.code, token };
}

export type IncomingInvite = {
  id: string;
  code: string;
  created: number;
  expires: number;
  sender: PublicAccount;
  hostName: string;
  players: number;
};

export async function incomingInvites(me: string, now: number) {
  const rows = await database()
    .prepare(
      "SELECT i.id,i.code,i.created,i.expires,a.id AS senderID,a.name AS senderName,a.handle AS senderHandle,json_extract(s.state,'$.hostName') AS hostName,json_extract(s.state,'$.phase') AS phase,json_array_length(s.state,'$.players') AS players FROM session_invites i JOIN accounts a ON a.id=i.sender JOIN sessions s ON s.code=i.code WHERE i.recipient=? AND i.status='pending' AND i.expires>? ORDER BY i.created DESC LIMIT 50",
    )
    .bind(me, now)
    .all<{
      id: string;
      code: string;
      created: number;
      expires: number;
      senderID: string;
      senderName: string;
      senderHandle: string | null;
      hostName: string;
      phase: string;
      players: number;
    }>();
  return rows.results
    .filter((i) => i.phase === 'lobby')
    .map<IncomingInvite>((i) => ({
      id: i.id,
      code: i.code,
      created: i.created,
      expires: i.expires,
      sender: { id: i.senderID, name: i.senderName, handle: i.senderHandle },
      hostName: i.hostName,
      players: i.players,
    }));
}

// Invitations sent from one table, visible to everyone seated there.
export async function sessionInvites(code: string, now: number) {
  const rows = await database()
    .prepare(
      'SELECT i.id,i.status,i.expires,i.sender,a.id AS account,a.name,a.handle FROM session_invites i JOIN accounts a ON a.id=i.recipient WHERE i.code=? ORDER BY i.created DESC LIMIT 50',
    )
    .bind(code)
    .all<{
      id: string;
      status: string;
      expires: number;
      sender: string;
      account: string;
      name: string;
      handle: string | null;
    }>();
  return rows.results.map((i) => ({
    ...i,
    status: i.status === 'pending' && i.expires <= now ? 'expired' : i.status,
  }));
}
