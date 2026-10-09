import { database } from '@/db';
import {
  accountByHandle,
  friendLists,
  relations,
  relationStatus,
  type PublicAccount,
  type RelationStatus,
} from './friends';
import { incomingInvites, sessionInvites } from './invites';
import { receivedRatings, ratingContext } from './ratings';
import { gamesTogether, recentGames, statsFor, type Stats } from './stats';
import { normalizeHandle } from './derive';
import { canView, privacyFor } from './privacy';

export type Friend = PublicAccount & {
  since: number;
  together: number;
  lastPlayed: number | null;
};

// The signed-in player's whole social picture, for the Friends page.
export async function socialView(me: string, now: number) {
  const [lists, together, invites, stats, recent, ratings, privacy] =
    await Promise.all([
      friendLists(me),
      gamesTogether(me),
      incomingInvites(me, now),
      statsFor(me),
      recentGames(me),
      receivedRatings(me),
      privacyFor(me),
    ]);
  return {
    friends: lists.friends.map<Friend>((f) => ({
      ...f,
      together: together.get(f.id)?.games || 0,
      lastPlayed: together.get(f.id)?.last ?? null,
    })),
    incoming: lists.incoming,
    outgoing: lists.outgoing,
    blocked: lists.blocked,
    invites,
    stats,
    recent,
    ratings,
    privacy,
  };
}

export type Profile = {
  account: PublicAccount;
  relation: RelationStatus | 'self';
  canRequest: boolean;
  games: number | null;
  recent: Awaited<ReturnType<typeof recentGames>> | null;
  stats: Stats | null;
  together: number;
};

// Profile identity is discoverable unless blocked; all record data is gated
// separately by the owner's statistics and history visibility.
export async function profileView(
  viewer: string,
  handleValue: unknown,
): Promise<Profile> {
  const handle = normalizeHandle(handleValue);
  const account = await accountByHandle(handle);
  if (!account) throw Error('No player has that handle.');
  const relation =
    account.id === viewer
      ? 'self'
      : relationStatus(viewer, await relations(viewer, account.id));
  if (relation === 'unavailable') throw Error('No player has that handle.');
  const privacy = await privacyFor(account.id);
  const full = canView(privacy.stats, relation);
  const stats = full ? await statsFor(account.id) : null;
  const recent = canView(privacy.history, relation)
    ? await recentGames(account.id)
    : null;
  const together = full ? await gamesTogether(viewer) : null;
  return {
    account,
    relation,
    canRequest: relation === 'none' && privacy.requests === 'everyone',
    games: stats ? stats.games + stats.storyteller.games : null,
    stats,
    recent,
    together: together?.get(account.id)?.games || 0,
  };
}

// What a seated player needs from the social system while at a table: their
// friends with invitation status (lobby), and the rating context (ended).
export async function tableView(me: string, code: string, now: number) {
  const [lists, sent, rating, preferences] = await Promise.all([
    friendLists(me),
    sessionInvites(code, now),
    ratingContext(me, code, now),
    database()
      .prepare(
        "SELECT s.account,s.game_invites AS invites FROM account_settings s JOIN friendships f ON (f.requester=s.account AND f.addressee=?) OR (f.addressee=s.account AND f.requester=?) WHERE f.status='accepted'",
      )
      .bind(me, me)
      .all<{ account: string; invites: string }>(),
  ]);
  const seated = await database()
    .prepare('SELECT account FROM account_seats WHERE code=?')
    .bind(code)
    .all<{ account: string }>();
  const present = new Set(seated.results.map((s) => s.account));
  return {
    friends: lists.friends.map((f) => ({
      ...f,
      seated: present.has(f.id),
      invitesAllowed: !preferences.results.some(
        (p) => p.account === f.id && p.invites === 'nobody',
      ),
      invite: sent.find((i) => i.account === f.id) || null,
    })),
    rating,
  };
}
