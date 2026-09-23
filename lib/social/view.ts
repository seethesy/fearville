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

export type Friend = PublicAccount & {
  since: number;
  together: number;
  lastPlayed: number | null;
};

// The signed-in player's whole social picture, for the Friends page.
export async function socialView(me: string, now: number) {
  const [lists, together, invites, stats, recent, ratings] = await Promise.all([
    friendLists(me),
    gamesTogether(me),
    incomingInvites(me, now),
    statsFor(me),
    recentGames(me),
    receivedRatings(me),
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
  };
}

export type Profile = {
  account: PublicAccount;
  relation: RelationStatus | 'self';
  games: number;
  stats: Stats | null;
  together: number;
};

// A public profile: anyone signed in sees the handle and games played;
// friends (and the player themselves) see the full record.
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
  const stats = await statsFor(account.id);
  const full = relation === 'self' || relation === 'friends';
  const together = full ? await gamesTogether(viewer) : null;
  return {
    account,
    relation,
    games: stats.games + stats.storyteller.games,
    stats: full ? stats : null,
    together: together?.get(account.id)?.games || 0,
  };
}

// What a seated player needs from the social system while at a table: their
// friends with invitation status (lobby), and the rating context (ended).
export async function tableView(me: string, code: string, now: number) {
  const [lists, sent, rating] = await Promise.all([
    friendLists(me),
    sessionInvites(code, now),
    ratingContext(me, code, now),
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
      invite: sent.find((i) => i.account === f.id) || null,
    })),
    rating,
  };
}
