// FEAR-119: report a player, a chat message and a rating comment; block from
// a chat message hides that player's chat; offensive handles and comments are
// rejected. Local D1 only.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.CT_TEST_URL || 'http://localhost:3000';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Fixtures are local-only.',
);
const id = 'rep-' + randomBytes(6).toString('hex');
const S = id + '-s',
  P = id + '-p';
const token = {
  [S]: randomBytes(32).toString('base64url'),
  [P]: randomBytes(32).toString('base64url'),
};
const sha = (s) => createHash('sha256').update(s).digest('hex');
const handleP = 'rp' + id.slice(-8);
const GAME = id + '-g';

function sql(statement) {
  mkdirSync('work', { recursive: true });
  const file = `work/${id}.sql`;
  writeFileSync(file, statement);
  const out = execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--persist-to',
      process.env.CT_D1_PERSIST || '.wrangler/state',
      '--config',
      'wrangler.local.json',
      '--file',
      file,
      '--json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out.slice(out.indexOf('['))).map((r) => r.results);
}

const now = Date.now();
sql(`
INSERT INTO accounts(id,name,email,created) VALUES ('${S}','Storyteller S','${S}@example.invalid',0),('${P}','Player P','${P}@example.invalid',0);
INSERT INTO account_sessions(hash,account,expires) VALUES ('${sha(token[S])}','${S}',${now + 600000}),('${sha(token[P])}','${P}',${now + 600000});
INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended) VALUES ('${GAME}','333333','${S}','Storyteller S','good','test',5,1,1,${now - 60000},${now - 1000});
INSERT INTO game_players(game,player,account,name,role,team,won,alive) VALUES ('${GAME}','pp','${P}','Player P','watchman','good',1,1);
`);

async function call(path, { account, member, body } = {}) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': id,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
      ...(member ? { Authorization: 'Bearer ' + member } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const ok = (r, label) => {
  assert.equal(r.status, 200, `${label}: ${JSON.stringify(r.data)}`);
  return r.data;
};

// Handle filter.
let r = await call('/api/social', {
  account: token[P],
  body: { action: 'handle', handle: 'sh1thead' },
});
assert.equal(r.status, 400);
assert.match(r.data.error, /isn’t allowed/);
assert.equal(
  (
    await call('/api/social', {
      account: token[P],
      body: { action: 'handle', handle: 'f_u_c_k' },
    })
  ).status,
  400,
);
ok(
  await call('/api/social', {
    account: token[P],
    body: { action: 'handle', handle: handleP },
  }),
  'valid handle',
);

// Rating comment filter, then a normal comment.
r = await call('/api/social', {
  account: token[P],
  body: { action: 'rate', game: GAME, stars: 2, comment: 'you piece of shit' },
});
assert.equal(r.status, 400);
assert.match(r.data.error, /offensive/);
ok(
  await call('/api/social', {
    account: token[P],
    body: {
      action: 'rate',
      game: GAME,
      stars: 2,
      comment: 'Too slow at night ' + id,
    },
  }),
  'rate',
);

// Player report by handle.
assert.equal(
  (
    await call('/api/reports', {
      account: token[S],
      body: { kind: 'player', handle: handleP, reason: 'nonsense' },
    })
  ).status,
  400,
);
ok(
  await call('/api/reports', {
    account: token[S],
    body: {
      kind: 'player',
      handle: handleP,
      reason: 'harassment',
      note: 'rude',
    },
  }),
  'report player',
);
assert.equal(
  (
    await call('/api/reports', {
      account: token[P],
      body: { kind: 'player', handle: handleP, reason: 'spam' },
    })
  ).status,
  400,
  'no self-report',
);
assert.equal(
  (
    await call('/api/reports', {
      body: { kind: 'player', handle: handleP, reason: 'spam' },
    })
  ).status,
  401,
  'guests cannot report profiles',
);

// Rating comment report: the Storyteller sees an opaque ref, never the rater.
const feedback = ok(
  await call('/api/social', { account: token[S] }),
  'S social',
).ratings;
const rating = feedback.find((f) => f.comment.includes(id));
assert.ok(rating?.ref, 'rating has a ref');
assert.equal('rater' in rating, false);
assert.equal('game' in rating, false);
ok(
  await call('/api/reports', {
    account: token[S],
    body: { kind: 'rating', ref: rating.ref, reason: 'other' },
  }),
  'report rating',
);
assert.equal(
  (
    await call('/api/reports', {
      account: token[P],
      body: { kind: 'rating', ref: rating.ref, reason: 'other' },
    })
  ).status,
  400,
  'only the rated Storyteller can report a comment',
);

// Chat: S hosts, P (account) and a guest join; both message the Storyteller.
const lobby = ok(
  await call('/api/session', {
    account: token[S],
    body: { action: 'create', name: 'Storyteller S' },
  }),
  'create',
);
const pSeat = ok(
  await call('/api/session', {
    account: token[P],
    body: { action: 'join', code: lobby.code, name: 'Player P' },
  }),
  'P joins',
);
const guest = ok(
  await call('/api/session', {
    body: { action: 'join', code: lobby.code, name: 'Guest G' },
  }),
  'guest joins',
);
ok(
  await call('/api/game', {
    member: pSeat.token,
    body: { action: 'chat', text: 'hello from P ' + id },
  }),
  'P chats',
);
ok(
  await call('/api/game', {
    member: guest.token,
    body: { action: 'chat', text: 'hello from G ' + id },
  }),
  'G chats',
);
let game = ok(await call('/api/game', { member: lobby.token }), 'S view');
const fromP = game.messages.find((m) => m.text === 'hello from P ' + id);
const fromG = game.messages.find((m) => m.text === 'hello from G ' + id);
assert.ok(fromP && fromG);

// Report a chat message (the reporter can be a guest seat too).
ok(
  await call('/api/reports', {
    account: token[S],
    member: lobby.token,
    body: { kind: 'chat', messageId: fromP.id, reason: 'harassment' },
  }),
  'report chat',
);
assert.equal(
  (
    await call('/api/reports', {
      member: pSeat.token,
      body: { kind: 'chat', messageId: fromP.id, reason: 'spam' },
    })
  ).status,
  400,
  'no reporting own message',
);
assert.equal(
  (
    await call('/api/reports', {
      member: guest.token,
      body: { kind: 'chat', messageId: fromP.id, reason: 'spam' },
    })
  ).status,
  400,
  'cannot report a message you cannot see',
);

// Block from a chat message: guests can't be blocked; P's chat disappears for S.
r = await call('/api/social', {
  account: token[S],
  body: { action: 'blockSeat', code: lobby.code, player: fromG.from },
});
assert.equal(r.status, 400);
assert.match(r.data.error, /guest/);
ok(
  await call('/api/social', {
    account: token[S],
    body: { action: 'blockSeat', code: lobby.code, player: fromP.from },
  }),
  'block P',
);
game = ok(
  await call('/api/game', { member: lobby.token }),
  'S view after block',
);
assert.equal(
  game.messages.some((m) => m.id === fromP.id),
  false,
  'blocked chat hidden',
);
assert.equal(
  game.messages.some((m) => m.id === fromG.id),
  true,
  'other chat still visible',
);
// P still sees their own message.
assert.ok(
  ok(await call('/api/game', { member: pSeat.token }), 'P view').messages.some(
    (m) => m.id === fromP.id,
  ),
);

// The queue has all three kinds with snapshots and targets.
const [reports] = sql(
  `SELECT kind, reason, target_account, content FROM player_reports WHERE reporter_account='${S}' ORDER BY created;`,
);
assert.deepEqual(
  reports.map((x) => x.kind),
  ['player', 'rating', 'chat'],
);
assert.ok(reports.every((x) => x.target_account === P));
assert.equal(reports[2].content, 'hello from P ' + id);

sql(
  `DELETE FROM player_reports WHERE target_account='${P}'; DELETE FROM sessions WHERE code='${lobby.code}'; DELETE FROM games WHERE id='${GAME}'; DELETE FROM accounts WHERE id IN ('${S}','${P}');`,
);
console.log(
  'PASS: handle and comment filter, player/chat/rating reports, blocking from chat (guests excluded), blocked chat hidden.',
);
