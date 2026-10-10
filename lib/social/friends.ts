import { database } from '@/db';
import { normalizeHandle } from './derive';
import { privacyFor } from './privacy';
import { HANDLE_COOLDOWN } from '@/lib/accounts/preferences';

export type PublicAccount = {
  id: string;
  name: string;
  handle: string | null;
  avatar?: string;
};
type Relation = { requester: string; addressee: string; status: string };

export async function accountByHandle(handle: string) {
  return database()
    .prepare(
      'SELECT a.id,a.name,a.handle,p.avatar FROM accounts a LEFT JOIN account_profiles p ON p.account=a.id WHERE a.handle=?',
    )
    .bind(handle)
    .first<PublicAccount>();
}
export async function accountByID(id: string) {
  return database()
    .prepare(
      'SELECT a.id,a.name,a.handle,p.avatar FROM accounts a LEFT JOIN account_profiles p ON p.account=a.id WHERE a.id=?',
    )
    .bind(id)
    .first<PublicAccount>();
}

// Every friendship row between two accounts, in either direction.
export async function relations(a: string, b: string) {
  const rows = await database()
    .prepare(
      'SELECT requester,addressee,status FROM friendships WHERE (requester=? AND addressee=?) OR (requester=? AND addressee=?)',
    )
    .bind(a, b, b, a)
    .all<Relation>();
  return rows.results;
}

// The relationship from `me` looking at `other`.
export function relationStatus(me: string, rows: Relation[]) {
  if (rows.some((r) => r.status === 'blocked' && r.requester === me))
    return 'blocked' as const;
  if (rows.some((r) => r.status === 'blocked')) return 'unavailable' as const;
  if (rows.some((r) => r.status === 'accepted')) return 'friends' as const;
  if (rows.some((r) => r.status === 'pending' && r.requester === me))
    return 'requested' as const;
  if (rows.some((r) => r.status === 'pending')) return 'incoming' as const;
  return 'none' as const;
}
export type RelationStatus = ReturnType<typeof relationStatus>;

export async function areFriends(a: string, b: string) {
  return relationStatus(a, await relations(a, b)) === 'friends';
}

export async function setHandle(account: string, value: unknown) {
  const handle = normalizeHandle(value);
  const db = database();
  const taken = await db
    .prepare('SELECT id FROM accounts WHERE handle=? AND id<>?')
    .bind(handle, account)
    .first();
  if (taken) throw Error('That handle is already taken.');
  const current = await db
    .prepare(
      'SELECT handle,handle_changed_at AS changed FROM accounts WHERE id=?',
    )
    .bind(account)
    .first<{
      handle: string | null;
      avatar?: string;
      changed: number | null;
    }>();
  if (current?.handle === handle) return handle;
  const now = Date.now();
  if (current?.changed && current.changed + HANDLE_COOLDOWN > now)
    throw Error(
      'You can change your username again on ' +
        new Date(current.changed + HANDLE_COOLDOWN).toISOString().slice(0, 10) +
        '.',
    );
  try {
    const result = await db
      .prepare(
        'UPDATE accounts SET handle=?,handle_changed_at=? WHERE id=? AND (handle_changed_at IS NULL OR handle_changed_at<=?)',
      )
      .bind(handle, now, account, now - HANDLE_COOLDOWN)
      .run();
    if (!result.meta.changes)
      throw Error(
        'Your username was just changed. Please refresh your profile.',
      );
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message))
      throw Error('That username is already taken.');
    throw error;
  }
  return handle;
}

export async function sendRequest(
  me: string,
  handleValue: unknown,
  now: number,
) {
  const handle = normalizeHandle(handleValue);
  const target = await accountByHandle(handle);
  if (!target) throw Error('No player has that handle.');
  if (target.id === me) throw Error('That is your own handle.');
  const status = relationStatus(me, await relations(me, target.id));
  if (status === 'blocked')
    throw Error('Unblock this player before sending a request.');
  if (status === 'unavailable')
    throw Error('A friend request cannot be sent to this player.');
  if (status === 'friends') throw Error('You are already friends.');
  if (status === 'requested') throw Error('Your request is already waiting.');
  if ((await privacyFor(target.id)).requests === 'nobody')
    throw Error('This player is not accepting friend requests.');
  const db = database();
  const outgoing = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM friendships WHERE requester=? AND status='pending'",
    )
    .bind(me)
    .first<{ n: number }>();
  if ((outgoing?.n || 0) >= 50)
    throw Error('You have too many waiting requests. Cancel some first.');
  await db.batch([
    db
      .prepare(
        "UPDATE friendships SET status='accepted',updated=? WHERE requester=? AND addressee=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM friendships b WHERE b.status='blocked' AND ((b.requester=? AND b.addressee=?) OR (b.requester=? AND b.addressee=?)))",
      )
      .bind(now, target.id, me, me, target.id, target.id, me),
    // Each batch sees the opposite request or block atomically. Simultaneous
    // mutual requests produce one accepted friendship, never two rows.
    db
      .prepare(
        "INSERT INTO friendships (requester,addressee,status,created,updated) SELECT ?,?,'pending',?,? WHERE NOT EXISTS (SELECT 1 FROM friendships WHERE (requester=? AND addressee=?) OR (requester=? AND addressee=?)) AND COALESCE((SELECT friend_requests FROM account_settings WHERE account=?),'everyone')='everyone' AND (SELECT COUNT(*) FROM friendships WHERE requester=? AND status='pending')<50",
      )
      .bind(
        me,
        target.id,
        now,
        now,
        me,
        target.id,
        target.id,
        me,
        target.id,
        me,
      ),
  ]);
  const current = relationStatus(me, await relations(me, target.id));
  if (current !== 'friends' && current !== 'requested')
    throw Error('A friend request cannot be sent to this player.');
  return { account: target, status: current };
}

export async function acceptRequest(me: string, other: string, now: number) {
  const r = await database()
    .prepare(
      "UPDATE friendships SET status='accepted',updated=? WHERE requester=? AND addressee=? AND status='pending'",
    )
    .bind(now, other, me)
    .run();
  if (r.meta.changes !== 1) throw Error('That request is no longer waiting.');
}

// Declines an incoming request or cancels an outgoing one.
export async function dismissRequest(me: string, other: string) {
  await database()
    .prepare(
      "DELETE FROM friendships WHERE status='pending' AND ((requester=? AND addressee=?) OR (requester=? AND addressee=?))",
    )
    .bind(other, me, me, other)
    .run();
}

export async function removeFriend(me: string, other: string) {
  const db = database();
  const rows = await db.batch([
    db
      .prepare(
        "DELETE FROM friendships WHERE status='accepted' AND ((requester=? AND addressee=?) OR (requester=? AND addressee=?))",
      )
      .bind(me, other, other, me),
    db
      .prepare(
        "UPDATE session_invites SET status='revoked' WHERE status='pending' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",
      )
      .bind(me, other, other, me),
  ]);
  if (rows[0].meta.changes === 0)
    throw Error('You are not friends with this player.');
}

// Blocking removes any friendship or waiting request, withdraws waiting
// invitations in both directions, and hides you from that player's searches.
export async function blockAccount(me: string, other: string, now: number) {
  if (me === other) throw Error('You cannot block yourself.');
  if (!(await accountByID(other))) throw Error('Player not found.');
  const db = database();
  await db.batch([
    db
      .prepare(
        "DELETE FROM friendships WHERE status<>'blocked' AND ((requester=? AND addressee=?) OR (requester=? AND addressee=?))",
      )
      .bind(me, other, other, me),
    db
      .prepare(
        "INSERT INTO friendships (requester,addressee,status,created,updated) VALUES (?,?,'blocked',?,?) ON CONFLICT(requester,addressee) DO UPDATE SET status='blocked',updated=excluded.updated",
      )
      .bind(me, other, now, now),
    db
      .prepare(
        "UPDATE session_invites SET status='revoked' WHERE status='pending' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",
      )
      .bind(me, other, other, me),
  ]);
}

export async function unblockAccount(me: string, other: string) {
  await database()
    .prepare(
      "DELETE FROM friendships WHERE requester=? AND addressee=? AND status='blocked'",
    )
    .bind(me, other)
    .run();
}

export async function friendLists(me: string) {
  const db = database();
  const friends = await db
    .prepare(
      "SELECT a.id,a.name,a.handle,f.updated AS since FROM friendships f JOIN accounts a ON a.id=CASE WHEN f.requester=? THEN f.addressee ELSE f.requester END WHERE f.status='accepted' AND (f.requester=? OR f.addressee=?) ORDER BY a.name COLLATE NOCASE",
    )
    .bind(me, me, me)
    .all<PublicAccount & { since: number }>();
  const incoming = await db
    .prepare(
      "SELECT a.id,a.name,a.handle,f.created FROM friendships f JOIN accounts a ON a.id=f.requester WHERE f.addressee=? AND f.status='pending' ORDER BY f.created DESC",
    )
    .bind(me)
    .all<PublicAccount & { created: number }>();
  const outgoing = await db
    .prepare(
      "SELECT a.id,a.name,a.handle,f.created FROM friendships f JOIN accounts a ON a.id=f.addressee WHERE f.requester=? AND f.status='pending' ORDER BY f.created DESC",
    )
    .bind(me)
    .all<PublicAccount & { created: number }>();
  const blocked = await db
    .prepare(
      "SELECT a.id,a.name,a.handle FROM friendships f JOIN accounts a ON a.id=f.addressee WHERE f.requester=? AND f.status='blocked' ORDER BY a.name COLLATE NOCASE",
    )
    .bind(me)
    .all<PublicAccount>();
  return {
    friends: friends.results,
    incoming: incoming.results,
    outgoing: outgoing.results,
    blocked: blocked.results,
  };
}
