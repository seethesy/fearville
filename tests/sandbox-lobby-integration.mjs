import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
import assert from 'node:assert/strict';

const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token = '', body) {
  const response = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

const created = await call('/api/session', '', {
  action: 'createSandbox',
  name: 'Sandbox QA',
});
assert.equal(created.status, 200, JSON.stringify(created.data));
const { token, code } = created.data;
const rejected = await call('/api/session', '', {
  action: 'join',
  code,
  name: 'Live player',
});
assert.equal(rejected.status, 400);

let game = (await call('/api/game', token)).data;
async function act(action, pov) {
  const result = await call('/api/game', token, {
    ...action,
    ...(pov ? { pov } : {}),
    version: game.version,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  game = result.data.game;
  return result.data;
}

for (let i = 1; i <= 5; i++)
  await act({ action: 'addDummy', name: `Dummy ${i}` });
const ids = game.players.map((player) => player.id);
assert.ok(game.players.every((player) => player.dummy));
await act({ action: 'randomAssign' });
await act({ action: 'start' });
assert.equal(game.deadline, null);
assert.equal(game.nightChoiceDeadline, null);

const pov = await call(`/api/game?pov=${ids[0]}`, token);
assert.equal(pov.status, 200, JSON.stringify(pov.data));
assert.equal(pov.data.host, false);
assert.equal(pov.data.sandboxHost, true);
assert.equal(pov.data.me, ids[0]);
assert.ok(pov.data.character);

await act({ action: 'end', winner: 'good' });
assert.equal(game.phase, 'ended');
assert.equal(game.recaps.at(-1).players.length, 5);
assert.ok(game.controls.some((control) => control.action === 'returnLobby'));
await act({ action: 'returnLobby' }, ids[0]);
assert.equal(game.phase, 'lobby');
assert.deepEqual(
  game.players.map((player) => player.id),
  ids,
);
assert.ok(game.players.every((player) => !player.role));
assert.equal(game.recaps.length, 1);
assert.ok(game.recaps[0].decisions.length > 0);

const lobby = await call('/api/session', '', {
  action: 'create',
  name: 'Reusable Lobby QA',
});
assert.equal(lobby.status, 200, JSON.stringify(lobby.data));
const seats = [];
for (let i = 1; i <= 5; i++) {
  const joined = await call('/api/session', '', {
    action: 'join',
    code: lobby.data.code,
    name: `Lobby Player ${i}`,
  });
  assert.equal(joined.status, 200, JSON.stringify(joined.data));
  seats.push(joined.data);
}
await claimSeats(base, seats.map((s) => s.token));
let shared = (await call('/api/game', lobby.data.token)).data;
async function sharedAct(tokenForAction, action) {
  const result = await call('/api/game', tokenForAction, {
    ...action,
    version: shared.version,
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  shared = result.data.game;
}
await sharedAct(lobby.data.token, { action: 'randomAssign' });
await sharedAct(lobby.data.token, { action: 'start' });
await sharedAct(lobby.data.token, { action: 'end', winner: 'evil' });
const sharedIds = shared.players.map((player) => player.id);
await sharedAct(seats[0].token, { action: 'returnLobby' });
assert.equal(shared.phase, 'lobby');
assert.deepEqual(
  shared.players.map((player) => player.id),
  sharedIds,
);
assert.equal((await call('/api/game', seats[1].token)).status, 200);
const left = await call('/api/session', seats[1].token, {
  action: 'leaveLobby',
});
assert.equal(left.status, 200, JSON.stringify(left.data));
assert.equal((await call('/api/game', seats[1].token)).status, 401);

console.log(
  'PASS: Sandbox dummy seats, POV privacy, disabled timers, recap, reusable seats, and lobby departure work over HTTP.',
);
