import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
import assert from 'node:assert/strict';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token = '', body) {
  const r = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
function ok(r) {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const host = ok(
  await call('/api/session', '', { action: 'create', name: 'Membership Host' }),
);
const players = [];
for (let i = 0; i < 5; i++)
  players.push(
    ok(
      await call('/api/session', '', {
        action: 'join',
        code: host.code,
        name: 'Member ' + i,
      }),
    ),
  );
await claimSeats(
  base,
  players.map((p) => p.token),
);
let g = ok(await call('/api/game', host.token));
assert.equal(
  (
    await call('/api/session', players[0].token, {
      action: 'remove',
      player: g.players[1].id,
    })
  ).status,
  400,
);
assert.equal(
  (await call('/api/session', players[0].token, { action: 'deleteLobby' }))
    .status,
  400,
);
ok(
  await call('/api/session', players[0].token, {
    action: 'rename',
    name: 'New name',
  }),
);
const chat = {
  action: 'chat',
  to: g.players[0].id,
  text: 'Private direct message',
  messageId: crypto.randomUUID(),
};
ok(await call('/api/game', host.token, chat));
ok(await call('/api/game', host.token, chat));
assert.equal(
  ok(await call('/api/game', players[0].token)).messages.filter(
    (m) => m.id === chat.messageId,
  ).length,
  1,
);
assert.equal(ok(await call('/api/game', players[1].token)).messages.length, 0);
ok(
  await call('/api/session', host.token, {
    action: 'remove',
    player: g.players[4].id,
  }),
);
assert.equal((await call('/api/game', players[4].token)).status, 401);
assert.equal((await call('/api/session', players[4].token)).status, 401);
g = ok(await call('/api/game', host.token));
assert.equal(g.players.length, 4);
assert.deepEqual(
  g.players.map((p) => p.seat),
  [1, 2, 3, 4],
);
players[4] = ok(
  await call('/api/session', '', {
    action: 'join',
    code: host.code,
    name: 'Replacement',
  }),
);
ok(await call('/api/game', players[4].token, { action: 'claimSeat', seat: 5 }));
g = ok(await call('/api/game', host.token));
g = ok(
  await call('/api/game', host.token, {
    action: 'randomAssign',
    version: g.version,
  }),
).game;
g = ok(
  await call('/api/game', host.token, { action: 'start', version: g.version }),
).game;
ok(
  await call('/api/session', host.token, {
    action: 'remove',
    player: g.players[3].id,
  }),
);
assert.equal((await call('/api/game', players[3].token)).status, 401);
ok(await call('/api/session', players[2].token, { action: 'leave' }));
assert.equal((await call('/api/game', players[2].token)).status, 200);
ok(await call('/api/session', players[2].token));
g = ok(await call('/api/game', host.token));
assert.equal(g.players.length, 5);
assert.equal(g.players.filter((p) => p.departed).length, 1);
assert.equal(
  (await call('/api/game', host.token, { action: 'undo', version: g.version }))
    .status,
  400,
);
assert.equal(
  (await call('/api/session', host.token, { action: 'deleteLobby' })).status,
  400,
);
const lobby = ok(
  await call('/api/session', '', { action: 'create', name: 'Delete QA' }),
);
const guest = ok(
  await call('/api/session', '', {
    action: 'join',
    code: lobby.code,
    name: 'Delete guest',
  }),
);
ok(await call('/api/session', lobby.token, { action: 'deleteLobby' }));
assert.equal((await call('/api/game', lobby.token)).status, 401);
assert.equal((await call('/api/game', guest.token)).status, 401);
console.log(
  'PASS: direct private messaging, retry deduplication, rename, removal revocation and reversible leave, active seat preservation, authorization, and lobby deletion.',
);
