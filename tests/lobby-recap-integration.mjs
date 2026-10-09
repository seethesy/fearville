import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token = '', body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
async function ok(path, token, body) {
  const r = await call(path, token, body);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const host = await ok('/api/session', '', {
  action: 'create',
  name: 'Recap QA Storyteller',
});
const members = [];
for (const name of ['Ada', 'Bram', 'Clara', 'Dorian', 'Evelyn'])
  members.push(
    await ok('/api/session', '', { action: 'join', code: host.code, name }),
  );
let game = await ok('/api/game', host.token);
assert.ok(game.players.every((p) => p.seat === 0));
const ids = game.players.map((p) => p.id);
const claims = await Promise.all(
  members
    .slice(0, 2)
    .map((m) => call('/api/game', m.token, { action: 'claimSeat', seat: 1 })),
);
assert.deepEqual(claims.map((r) => r.status).sort((a, b) => a - b), [200, 400]);
const loser = claims.findIndex((r) => r.status !== 200);
await ok('/api/game', members[loser].token, { action: 'claimSeat', seat: 2 });
for (let i = 2; i < 5; i++)
  await ok('/api/game', members[i].token, { action: 'claimSeat', seat: i + 1 });
async function act(command, token = host.token) {
  game = await ok('/api/game', token);
  const r = await ok('/api/game', token, { ...command, version: game.version });
  game = r.game;
  return game;
}
await act({ action: 'randomAssign' });
await act({ action: 'start' });
const started = game.gameStartedAt;
await act(
  {
    action: 'saveNotebook',
    started,
    notebook: {
      text: 'I suspected Bram after the first night.',
      roles: { monster: 2 },
      players: { [ids[1]]: { role: 'monster', confidence: 'suspected' } },
    },
  },
  members[0].token,
);
const privateView = await ok('/api/game', members[1].token);
assert.equal(privateView.notebook, null);
assert.equal(privateView.recaps.length, 0);
await act(
  {
    action: 'chat',
    to: 'host',
    text: 'My first-night clue points toward Bram.',
  },
  members[0].token,
);
await act({ action: 'end', winner: 'good' });
const recap = game.recaps.at(-1).id,
  ended = game.recaps.at(-1).ended;
assert.ok(
  game.recaps[0].players
    .find((p) => p.id === ids[0])
    .notebook.text.includes('Bram'),
);
assert.ok(
  game.recaps[0].messages.some((m) => m.text.includes('first-night clue')),
);
assert.equal(
  (
    await call('/api/game', members[0].token, {
      action: 'mvpVote',
      recap,
      player: ids[0],
    })
  ).status,
  400,
);
const votes = await Promise.all(
  [1, 2].map((i) =>
    call('/api/game', members[0].token, {
      action: 'mvpVote',
      recap,
      player: ids[i],
    }),
  ),
);
assert.deepEqual(votes.map((r) => r.status).sort((a, b) => a - b), [200, 400]);
for (let i = 0; i < 3; i++)
  await act({ action: 'mvpVote', recap, player: ids[i] });
assert.equal(
  (
    await call('/api/game', host.token, {
      action: 'mvpVote',
      recap,
      player: ids[3],
    })
  ).status,
  400,
);
await act({ action: 'returnLobby', recap }, members[1].token);
await act({ action: 'mvpVote', recap, player: ids[0] }, members[2].token);
await act({ action: 'returnLobby', recap }, members[2].token);
assert.equal(game.recaps.length, 1);
assert.equal(game.recaps[0].ended, ended);
assert.equal(game.recaps[0].mvpCounts[ids[0]], 2);
assert.ok(!('votes' in game.recaps[0]));
await act({ action: 'randomAssign' });
await act({ action: 'start' });
assert.equal(game.recaps.length, 1);
assert.equal(game.notebook, null);
await act({ action: 'end', winner: 'evil' });
assert.deepEqual(
  game.recaps.map((r) => r.number),
  [1, 2],
);
assert.notEqual(game.recaps[0].id, game.recaps[1].id);
assert.equal(
  game.recaps[1].players.find((p) => p.id === ids[0]).notebook,
  undefined,
);
await mkdir('.wrangler', { recursive: true });
await writeFile(
  '.wrangler/lobby-recap-qa.json',
  JSON.stringify({ host, members }),
);
console.log(
  'PASS: simultaneous seat claims, competing MVP votes, private notes, recap revelation, duration, shared return and two-game history over HTTP.',
);
