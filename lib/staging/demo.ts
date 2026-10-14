// FEAR-161: a staging demo account with friends, requests, a block, a pending
// table invitation, game history, given and received Storyteller ratings.
// Builds on the synthetic accounts from seed.ts. Idempotent; never production.
import { SEED_ACCOUNT_PREFIX, seedStatements } from './seed.ts';

export const DEMO_ACCOUNT = SEED_ACCOUNT_PREFIX + 'demo';
export const DEMO_HANDLE = 'stage_qa_demo';
const id = (s: string) => SEED_ACCOUNT_PREFIX + s;
const DEMO_GAME = id('demo-game'); // outside the seed's 'game-%' count

/**
 * `lobby` is an existing session code the invitation points at; without one
 * no invitation is seeded. `hidden` (FEAR-158, production) seeds every
 * synthetic account without a handle so it can never be discovered.
 */
export function demoStatements(now: number, lobby?: string, hidden = false) {
  const sql = seedStatements(now, hidden);
  sql.push(
    `INSERT INTO accounts(id,name,email,handle,created) VALUES ('${DEMO_ACCOUNT}','QA Demo','${DEMO_ACCOUNT}@example.invalid',${hidden ? 'NULL' : `'${DEMO_HANDLE}'`},${now}) ON CONFLICT(id) DO NOTHING;`,
    `INSERT INTO account_profiles(account,lobby_name) VALUES ('${DEMO_ACCOUNT}','QA Demo') ON CONFLICT(account) DO NOTHING;`,
    `INSERT INTO account_settings(account) VALUES ('${DEMO_ACCOUNT}') ON CONFLICT(account) DO NOTHING;`,
  );
  const friendship = (from: string, to: string, status: string) =>
    `INSERT INTO friendships(requester,addressee,status,created,updated) VALUES ('${from}','${to}','${status}',${now},${now}) ON CONFLICT(requester,addressee) DO UPDATE SET status=excluded.status, updated=excluded.updated;`;
  sql.push(
    friendship(id('host'), DEMO_ACCOUNT, 'accepted'),
    friendship(DEMO_ACCOUNT, id('player-1'), 'accepted'),
    friendship(id('player-2'), DEMO_ACCOUNT, 'accepted'),
    friendship(id('player-3'), DEMO_ACCOUNT, 'pending'), // incoming request
    friendship(DEMO_ACCOUNT, id('player-4'), 'pending'), // outgoing request
    friendship(DEMO_ACCOUNT, id('player-5'), 'blocked'),
  );
  // History: the demo account played in all three seeded games.
  const roles = [
    ['watchman', 'good', 1, 1],
    ['basilisk', 'evil', 0, 0],
    ['guardian', 'neutral', 1, 1],
  ] as const;
  roles.forEach(([role, team, won, alive], i) =>
    sql.push(
      `INSERT INTO game_players(game,player,account,name,role,team,won,alive,base_xp) VALUES ('${id(`game-${i + 1}`)}','p6','${DEMO_ACCOUNT}','QA Demo','${role}','${team}',${won},${alive},75) ON CONFLICT(game,player) DO NOTHING;`,
    ),
  );
  // Game 1 stays unrated so the rating form shows; game 2 has a rating.
  sql.push(
    `INSERT INTO storyteller_ratings(game,rater,storyteller,stars,comment,created) VALUES ('${id('game-2')}','${DEMO_ACCOUNT}','${id('host')}',4,'Great pacing on night 2.',${now}) ON CONFLICT(game,rater) DO NOTHING;`,
  );
  // A game the demo account told, with feedback from two players.
  const started = now - 2 * 86400000;
  sql.push(
    `INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended,script,host_xp) VALUES ('${DEMO_GAME}','SEED04','${DEMO_ACCOUNT}','QA Demo','evil','Synthetic staging sample',5,3,3,${started},${started + 2400000},'horrors',25) ON CONFLICT(id) DO NOTHING;`,
  );
  for (let i = 1; i <= 5; i++)
    sql.push(
      `INSERT INTO game_players(game,player,account,name,role,team,won,alive,base_xp) VALUES ('${DEMO_GAME}','p${i}','${id(`player-${i}`)}','QA Player ${i}','${i === 5 ? 'monster' : 'doctor'}','${i === 5 ? 'evil' : 'good'}',${i === 5 ? 1 : 0},1,75) ON CONFLICT(game,player) DO NOTHING;`,
    );
  sql.push(
    `INSERT INTO storyteller_ratings(game,rater,storyteller,stars,comment,created) VALUES ('${DEMO_GAME}','${id('player-1')}','${DEMO_ACCOUNT}',5,'Loved the twist at the end.',${now}) ON CONFLICT(game,rater) DO NOTHING;`,
    `INSERT INTO storyteller_ratings(game,rater,storyteller,stars,comment,created) VALUES ('${DEMO_GAME}','${id('player-2')}','${DEMO_ACCOUNT}',3,'',${now}) ON CONFLICT(game,rater) DO NOTHING;`,
  );
  // A pending table invitation from a friend, refreshed on every load.
  if (lobby)
    sql.push(
    `INSERT INTO session_invites(id,code,sender,recipient,status,created,expires) VALUES ('${id('invite-demo')}','${lobby}','${id('host')}','${DEMO_ACCOUNT}','pending',${now},${now + 86400000}) ON CONFLICT(code,recipient) DO UPDATE SET status='pending', created=excluded.created, expires=excluded.expires;`,
  );
  return sql;
}
