import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
import assert from 'node:assert/strict';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token = '', body) {
  const r = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: 'ct_session=' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie'),
  };
}
function ok(r) {
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const created = await call('/api/session', '', {
  action: 'create',
  name: 'Returning Host',
});
const host = ok(created);
assert.match(created.cookie, /HttpOnly/);
assert.match(created.cookie, /Max-Age=2592000/);
const players = [];
for (let i = 0; i < 5; i++)
  players.push(
    ok(
      await call('/api/session', '', {
        action: 'join',
        name: 'Returning ' + i,
        code: host.code,
      }),
    ),
  );
await claimSeats(
  base,
  players.map((p) => p.token),
);
const initial = ok(await call('/api/game', host.token));
for (const token of [host.token, players[0].token]) {
  const before = ok(await call('/api/game', token));
  const resumed = ok(
    await call('/api/session', token, {
      action: 'join',
      code: host.code,
      name: 'Do not create another seat',
    }),
  );
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.token, token);
  const after = ok(await call('/api/game', token));
  assert.equal(after.me, before.me);
  assert.equal(after.host, before.host);
  assert.equal(after.players.length, 5);
  assert.equal(after.version, before.version);
  const info = ok(await call('/api/session', token));
  assert.equal(info.host, before.host);
  assert.equal(info.phase, 'lobby');
  assert.equal(info.name, before.host ? 'Returning Host' : 'Returning 0');
}
// An unauthenticated device cannot claim an existing identity merely by name.
// Name collisions are allowed; only credentials recover the saved seat.
const duplicate = ok(
  await call('/api/session', '', {
    action: 'join',
    code: host.code,
    name: 'Returning 0',
  }),
);
assert.notEqual(
  ok(await call('/api/game', duplicate.token)).me,
  initial.players[0].id,
);
ok(await call('/api/session', duplicate.token, { action: 'leaveLobby' }));
initial.version = ok(await call('/api/game', host.token)).version;
assert.equal(
  (
    await call('/api/game', players[0].token, {
      action: 'randomAssign',
      version: initial.version,
    })
  ).status,
  400,
);
const preview = ok(
  await call('/api/game', host.token, {
    action: 'randomAssign',
    preview: true,
    version: initial.version,
  }),
);
assert.deepEqual(
  ok(await call('/api/game', host.token)).players,
  initial.players,
);
const assigned = ok(
  await call('/api/game', host.token, {
    action: 'randomAssign',
    version: preview.version,
  }),
);
assert.equal(assigned.summary, preview.summary);
assert.deepEqual(assigned.game.issues, []);
// Manual controls remain available after the random deal.
const edit = assigned.game.controls.find((c) => c.action === 'edit');
const values = Object.fromEntries(
  edit.fields.map((f) => [f.key, f.value ?? '']),
);
const edited = ok(
  await call('/api/game', host.token, {
    ...values,
    action: 'edit',
    version: assigned.game.version,
  }),
);
const started = ok(
  await call('/api/game', host.token, {
    action: 'start',
    version: edited.game.version,
  }),
);
assert.equal(started.game.phase, 'night');
for (const token of [host.token, players[0].token]) {
  const before = ok(await call('/api/game', token));
  ok(await call('/api/session', token, { action: 'join', code: host.code }));
  const restored = await call('/api/session', token);
  ok(restored);
  assert.equal(restored.data.host, before.host);
  const after = ok(await call('/api/game', token));
  assert.equal(after.me, before.me);
  assert.equal(after.host, before.host);
  assert.deepEqual(after.character, before.character);
  assert.equal(after.players.length, 5);
}
assert.equal(
  (
    await call('/api/session', '', {
      action: 'join',
      name: 'Returning 0',
      code: host.code,
    })
  ).status,
  400,
);
assert.equal((await call('/api/session', 'invalid-key')).status, 401);
console.log(
  'PASS: stable random preview, manual assignment, persistent cookies, player/Storyteller rejoin before and after start, authenticated reconnection, and impersonation rejection.',
);
