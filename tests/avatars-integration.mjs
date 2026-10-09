import assert from 'node:assert/strict';
import { AVATARS } from '../lib/game/avatars.ts';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token, body) {
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
const created = await call('/api/session', '', {
  action: 'createSandbox',
  name: 'Avatar uniqueness QA',
});
assert.equal(created.status, 200);
const token = created.data.token;
let game = (await call('/api/game', token)).data;
async function act(command) {
  const r = await call('/api/game', token, {
    ...command,
    version: game.version,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  game = r.data.game;
  return r;
}
await act({ action: 'addDummy', name: 'First' });
await act({ action: 'addDummy', name: 'Second' });
assert.equal(new Set(game.players.map((p) => p.avatar)).size, 2);
const ids = game.players.map((p) => p.id);
const free = AVATARS.find((a) =>
  game.players.every((p) => p.avatar !== a.id),
).id;
const race = await Promise.all(
  ids.map((pov) =>
    call('/api/game', token, {
      action: 'setAvatar',
      avatar: free,
      pov,
      version: game.version,
    }),
  ),
);
assert.deepEqual(race.map((r) => r.status).sort((a, b) => a - b), [200, 409]);
game = (await call('/api/game', token)).data;
assert.equal(game.players.filter((p) => p.avatar === free).length, 1);
const loser = game.players.find((p) => p.avatar !== free);
const duplicate = await call('/api/game', token, {
  action: 'setAvatar',
  avatar: free,
  pov: loser.id,
  version: game.version,
});
assert.equal(duplicate.status, 400);
assert.match(duplicate.data.error, /already taken/);
await act({ action: 'overridePhase', phase: 'night' });
const locked = await call('/api/game', token, {
  action: 'setAvatar',
  avatar: loser.avatar,
  deathEffect: 'embers',
  pov: loser.id,
  version: game.version,
});
assert.equal(locked.status, 400);
assert.match(locked.data.error, /pregame lobby/);
console.log(
  'PASS: unique join defaults, simultaneous preset claims, duplicate rejection, and in-game cosmetic lock over HTTP.',
);
