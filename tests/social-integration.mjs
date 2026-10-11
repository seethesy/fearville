import { claimSeats } from './claim-seats.mjs';
// Social system integration test. Requires the development server and the
// local D1 database with all migrations applied. Creates fixture accounts,
// exercises handles, friend requests, invitations, a full recorded game,
// Storyteller ratings, statistics, and rewind withdrawal, then deletes them.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
const prefix = 'social-' + randomBytes(4).toString('hex');
const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => prefix + '-' + x);
const tokens = ids.map(() => randomBytes(32).toString('base64url'));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const suffix = randomBytes(2).toString('hex');
mkdirSync('work', { recursive: true });
writeFileSync(
  'work/social-fixture.sql',
  `INSERT INTO accounts(id,name,email,created) VALUES ${ids.map((id, i) => `('${id}','Player ${'ABCDEF'[i]}','${id}@example.invalid',0)`).join(',')};
INSERT INTO account_sessions(hash,account,expires) VALUES ${ids.map((id, i) => `('${hash(tokens[i])}','${id}',${Date.now() + 600000})`).join(',')};`,
);
execFileSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'd1',
    'execute',
    'site-creator-d1',
    '--local',
    '--config',
    'wrangler.local.json',
    '--file',
    'work/social-fixture.sql',
  ],
  { stdio: 'pipe' },
);
const [A, B, C, D, E, F] = ids;
const [tA, tB, tC, tD, tE, tF] = tokens;
async function call(path, account = '', body, member = '') {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': prefix,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
      ...(member ? { Authorization: 'Bearer ' + member } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await json(response,path) };
}
const social = (account, body, member) =>
  call('/api/social', account, body, member);
const ok = async (promise, label) => {
  const r = await promise;
  assert.equal(r.status, 200, label + ': ' + JSON.stringify(r.data));
  return r.data;
};
const bad = async (promise, status, label) => {
  const r = await promise;
  assert.equal(r.status, status, label + ': ' + JSON.stringify(r.data));
  return r.data;
};

// --- Handles ---------------------------------------------------------------
await bad(social('', { action: 'handle', handle: 'x' }), 401, 'guest handle');
await bad(social(tA, { action: 'handle', handle: 'ab' }), 400, 'short handle');
await bad(social(tA, { action: 'handle', handle: 'host' }), 400, 'reserved');
const handles = ids.map((_, i) => 'st_' + 'abcdef'[i] + suffix);
for (let i = 0; i < ids.length; i++)
  assert.equal(
    (
      await ok(
        social(tokens[i], {
          action: 'handle',
          handle: '@' + handles[i].toUpperCase(),
        }),
        'set handle',
      )
    ).handle,
    handles[i],
  );
await bad(
  social(tB, { action: 'handle', handle: handles[0] }),
  400,
  'duplicate handle',
);
assert.equal(
  (await ok(call('/api/accounts', tA), 'account view')).account.handle,
  handles[0],
);

// --- Friend requests ---------------------------------------------------------
await bad(
  social(tA, { action: 'request', handle: handles[0] }),
  400,
  'self request',
);
await bad(
  social(tA, { action: 'request', handle: 'nobody_here_' + suffix }),
  400,
  'unknown',
);
assert.equal(
  (await ok(social(tA, { action: 'request', handle: handles[1] }), 'A→B'))
    .status,
  'requested',
);
await bad(
  social(tA, { action: 'request', handle: handles[1] }),
  400,
  'duplicate request',
);
let viewB = await ok(social(tB), 'B view');
assert.equal(viewB.incoming.length, 1);
assert.equal(viewB.incoming[0].id, A);
assert.equal(
  (await ok(call('/api/accounts', tB), 'B pending')).pending.requests,
  1,
);
let viewA = await ok(social(tA), 'A view');
assert.equal(viewA.outgoing[0].id, B);
await bad(
  social(tC, { action: 'accept', account: A }),
  400,
  'C cannot accept A→B',
);
await ok(social(tB, { action: 'accept', account: A }), 'B accepts');
viewA = await ok(social(tA), 'A view');
assert.deepEqual(
  viewA.friends.map((f) => f.id),
  [B],
);
assert.equal(viewA.friends[0].together, 0);
// Mutual requests resolve into a friendship without a separate accept.
await ok(social(tC, { action: 'request', handle: handles[0] }), 'C→A');
assert.equal(
  (await ok(social(tA, { action: 'request', handle: handles[2] }), 'A→C'))
    .status,
  'friends',
);
// Decline, cancel, remove, block.
await ok(social(tD, { action: 'request', handle: handles[0] }), 'D→A');
await ok(social(tA, { action: 'dismiss', account: D }), 'A declines D');
assert.equal((await ok(social(tD), 'D view')).outgoing.length, 0);
await ok(social(tA, { action: 'request', handle: handles[3] }), 'A→D');
await ok(social(tA, { action: 'dismiss', account: D }), 'A cancels');
await ok(social(tA, { action: 'request', handle: handles[3] }), 'A→D again');
await ok(social(tD, { action: 'block', account: A }), 'D blocks A');
await bad(
  social(tA, { action: 'request', handle: handles[3] }),
  400,
  'blocked request',
);
await bad(
  call('/api/social/profile?handle=' + handles[3], tA),
  400,
  'blocked profile hidden',
);
await ok(social(tD, { action: 'unblock', account: A }), 'D unblocks');
assert.equal(
  (await ok(call('/api/social/profile?handle=' + handles[3], tA), 'profile'))
    .relation,
  'none',
);
await ok(social(tA, { action: 'request', handle: handles[4] }), 'A→E');
await ok(social(tE, { action: 'accept', account: A }), 'E accepts');
await ok(social(tE, { action: 'remove', account: A }), 'E removes A');
await bad(social(tE, { action: 'remove', account: A }), 400, 'remove twice');
// Profiles: friends see stats, others only the public summary.
const profileByB = await ok(
  call('/api/social/profile?handle=' + handles[0], tB),
  'B views A',
);
assert.equal(profileByB.relation, 'friends');
assert.ok(profileByB.stats);
const profileByE = await ok(
  call('/api/social/profile?handle=' + handles[0], tE),
  'E views A',
);
assert.equal(profileByE.relation, 'none');
assert.equal(profileByE.stats, null);
assert.equal(
  (await ok(call('/api/social/profile?handle=' + handles[0], tA), 'self'))
    .relation,
  'self',
);

// --- Invitations -------------------------------------------------------------
const created = await ok(
  call('/api/session', tA, { action: 'create', name: 'Storyteller A' }),
  'A hosts',
);
const code = created.data?.code || created.code;
const hostToken = created.token;
await bad(
  social(tE, { action: 'invite', code, account: B }, ''),
  400,
  'non-member invite',
);
await bad(
  social(tA, { action: 'invite', code, account: E }, hostToken),
  400,
  'invite non-friend',
);
await ok(
  social(tA, { action: 'invite', code, account: B }, hostToken),
  'A invites B',
);
await ok(
  social(tA, { action: 'invite', code, account: C }, hostToken),
  'A invites C',
);
await bad(
  social(tE, { action: 'invite', code, account: B }),
  400,
  'E cannot invite',
);
const table = await ok(
  call('/api/social/table?code=' + code, tA, undefined, hostToken),
  'table view',
);
assert.equal(table.friends.find((f) => f.id === B).invite.status, 'pending');
assert.equal(
  (await ok(call('/api/accounts', tB), 'B badge')).pending.invites,
  1,
);
viewB = await ok(social(tB), 'B invites');
assert.equal(viewB.invites.length, 1);
assert.equal(viewB.invites[0].code, code);
assert.equal(viewB.invites[0].sender.handle, handles[0]);
await bad(
  social(tC, { action: 'acceptInvite', invite: viewB.invites[0].id }),
  400,
  'wrong recipient',
);
const seatB = await ok(
  social(tB, { action: 'acceptInvite', invite: viewB.invites[0].id }),
  'B accepts',
);
assert.equal(seatB.code, code);
assert.ok(seatB.token);
await bad(
  social(tB, { action: 'acceptInvite', invite: viewB.invites[0].id }),
  400,
  'single use',
);
assert.equal((await ok(social(tB), 'B after')).invites.length, 0);
const viewC = await ok(social(tC), 'C invites');
await ok(
  social(tC, { action: 'declineInvite', invite: viewC.invites[0].id }),
  'C declines',
);
assert.equal((await ok(social(tC), 'C after')).invites.length, 0);
await bad(
  social(tA, { action: 'invite', code, account: B }, hostToken),
  400,
  'already seated',
);
// The invitee sits at the table under their account name, seat saved.
let state = await ok(call('/api/game', '', undefined, hostToken), 'host state');
assert.equal(state.players.length, 1);
assert.equal(state.players[0].name, 'Player B');
assert.equal(
  (await ok(call('/api/accounts', tB), 'B seats')).seats[0].code,
  code,
);
// Invitations also work from a seated player, not only the Storyteller.
await ok(social(tB, { action: 'request', handle: handles[5] }), 'B→F');
await ok(social(tF, { action: 'accept', account: B }), 'F accepts');
await ok(
  social(tB, { action: 'invite', code, account: F }, seatB.token),
  'B invites F',
);
const viewF = await ok(social(tF), 'F invites');
const seatF = await ok(
  social(tF, {
    action: 'acceptInvite',
    invite: viewF.invites[0].id,
    name: 'Effie',
  }),
  'F accepts',
);

// --- A full game: guests plus linked accounts --------------------------------
const guests = [];
for (const name of ['Guest 1', 'Guest 2', 'Guest 3'])
  guests.push(
    await ok(call('/api/session', '', { action: 'join', code, name }), name),
  );
await claimSeats(base, [seatB.token, seatF.token, ...guests.map((g) => g.token)]);
// Guest 3 signs in later and saves the seat: the record must pick it up.
const guestToken = guests[2].token;
async function action(payload, token = hostToken) {
  state = (await call('/api/game', '', undefined, token)).data;
  const r = await call(
    '/api/game',
    '',
    { ...payload, version: state.version },
    token,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  state = r.data.game;
  return r.data;
}
const roles = ['judge', 'teacher', 'hoflibrarian', 'monster', 'basilisk'];
state = await ok(call('/api/game', '', undefined, hostToken), 'full table');
assert.deepEqual(
  state.players.map((p) => p.name),
  ['Player B', 'Effie', 'Guest 1', 'Guest 2', 'Guest 3'],
);
for (let i = 0; i < 5; i++) {
  const p = state.players[i];
  await action({
    action: 'edit',
    player: p.id,
    name: p.name,
    seat: p.seat,
    role: roles[i],
    alive: true,
    ghost: true,
  });
}
await action({
  action: 'configure',
  discovery: 5,
  discussion: 5,
  nomination: 60,
  defense: 5,
  voting: 5,
  bluff1: 'doctor',
  bluff2: 'watchman',
  bluff3: 'bodyguard',
  redHerring: state.players[0].id,
});
await action({ action: 'start' });
assert.equal(state.phase, 'night');
// Nothing is recorded before the game ends.
assert.equal((await ok(social(tA), 'A pre')).stats.storyteller.games, 0);
await action({ action: 'end', winner: 'evil' });
assert.equal(state.phase, 'ended');
// Stats: A storytold; B (judge, good) lost; F (teacher, good) lost.
viewA = await ok(social(tA), 'A post');
assert.equal(viewA.stats.storyteller.games, 1);
assert.equal(viewA.stats.games, 0);
assert.equal(viewA.friends.find((f) => f.id === B).together, 1);
assert.equal(viewA.recent[0].storyteller, true);
viewB = await ok(social(tB), 'B post');
assert.deepEqual(viewB.stats.town, { wins: 0, losses: 1 });
assert.deepEqual(viewB.stats.evil, { wins: 0, losses: 0 });
assert.deepEqual(viewB.stats.roles.map(({ role, name, team, played, wins, losses }) => ({ role, name, team, played, wins, losses })), [
  {
    role: 'judge',
    name: 'Judge',
    team: 'good',
    played: 1,
    wins: 0,
    losses: 1,
  },
]);
assert.equal(viewB.friends.find((f) => f.id === A).together, 1);
assert.equal(viewB.friends.find((f) => f.id === F).together, 1);
assert.equal(viewB.recent[0].roleName, 'Judge');
assert.equal(viewB.recent[0].winner, 'evil');
// Guest 3 (basilisk, evil, won) attaches the seat afterwards.
assert.equal((await ok(social(tD), 'D before attach')).stats.games, 0);
await ok(
  call('/api/accounts', tD, { action: 'attach' }, guestToken),
  'D attaches',
);
const viewD = await ok(social(tD), 'D after attach');
assert.deepEqual(viewD.stats.evil, { wins: 1, losses: 0 });
assert.equal(viewD.stats.roles[0].role, 'basilisk');

// --- Ratings -----------------------------------------------------------------
const rating = await ok(
  call('/api/social/table?code=' + code, tB, undefined, seatB.token),
  'rating context',
);
assert.equal(rating.rating.canRate, true);
assert.equal(rating.rating.storyteller.handle, handles[0]);
const game = rating.rating.game;
await bad(social(tB, { action: 'rate', game, stars: 6 }), 400, 'six stars');
await bad(social(tA, { action: 'rate', game, stars: 5 }), 400, 'self rating');
await bad(
  social(tE, { action: 'rate', game, stars: 5 }),
  400,
  'outsider rating',
);
await ok(
  social(tB, { action: 'rate', game, stars: 4, comment: 'Clear night order.' }),
  'B rates',
);
await ok(social(tF, { action: 'rate', game, stars: 5 }), 'F rates');
await ok(
  social(tB, { action: 'rate', game, stars: 3, comment: 'Revised.' }),
  'B revises',
);
viewA = await ok(social(tA), 'A rated');
assert.equal(viewA.stats.storyteller.ratings, 2);
assert.equal(viewA.stats.storyteller.rating, 4);
assert.equal(viewA.ratings.length, 2);
assert.ok(viewA.ratings.some((r) => r.comment === 'Revised.'));
assert.ok(!viewA.ratings.some((r) => 'rater' in r));
assert.equal(
  (
    await ok(
      call('/api/social/table?code=' + code, tB, undefined, seatB.token),
      'mine',
    )
  ).rating.mine.stars,
  3,
);
// Friends see the average; the profile view never exposes comments.
const profile = await ok(
  call('/api/social/profile?handle=' + handles[0], tB),
  'A profile',
);
assert.equal(profile.stats.storyteller.rating, 4);
assert.equal(profile.together, 1);

// --- Rewind withdraws the result; ending again restores it -------------------
await action({ action: 'undo' });
assert.notEqual(state.phase, 'ended');
assert.equal((await ok(social(tA), 'A rewound')).stats.storyteller.games, 0);
assert.equal((await ok(social(tB), 'B rewound')).stats.games, 0);
await action({ action: 'end', winner: 'good' });
viewB = await ok(social(tB), 'B re-ended');
assert.deepEqual(viewB.stats.town, { wins: 1, losses: 0 });
assert.equal((await ok(social(tA), 'A re-ended')).stats.storyteller.ratings, 0);
await ok(social(tB, { action: 'rate', game, stars: 5 }), 'B rates again');

// --- Account deletion keeps other players' records ---------------------------
await ok(
  call('/api/accounts', tF, { action: 'delete', confirm: 'DELETE' }),
  'F deletes',
);
viewB = await ok(social(tB), 'B after F');
assert.equal(viewB.stats.games, 1);
assert.equal(
  viewB.friends.some((f) => f.id === F),
  false,
);
await ok(
  call('/api/accounts', tA, { action: 'delete', confirm: 'DELETE' }),
  'A deletes',
);
viewB = await ok(social(tB), 'B after A');
assert.equal(viewB.stats.games, 1, 'record survives the host session deletion');
// FEAR-118: a deleted Storyteller's name is anonymised in others' history.
assert.equal(viewB.recent[0].hostName, 'Former player');
for (const t of [tB, tC, tD, tE])
  await call('/api/accounts', t, { action: 'delete', confirm: 'DELETE' });
console.log(
  'PASS: handles, friend requests (accept, decline, cancel, mutual, remove, block), profiles, invitations (send, accept, decline, single use, seating), recorded results with late seat attachment, Storyteller ratings and averages, rewind withdrawal, and deletion.',
);

async function json(response,path) { const text=await response.text(); try { return JSON.parse(text); } catch { throw Error(path+" returned "+response.status+": "+text); } }
