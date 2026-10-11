import assert from 'node:assert/strict';
import { hostFixtureFetch } from './host-fixture.mjs';

const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token, body) {
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

const created = await call('/api/session', '', { action: 'create', name: 'Concurrency Host' });
assert.equal(created.status, 200, JSON.stringify(created.data));
const { code, token } = created.data;
const initial = await call('/api/game', token);
assert.equal(initial.status, 200);
const joined = await call('/api/session', '', { action: 'join', code, name: 'First Player' });
assert.equal(joined.status, 200, JSON.stringify(joined.data));
const latest = await call('/api/game', token);
assert.equal(latest.status, 200);
assert.ok(latest.data.version > initial.data.version);
const player = latest.data.players[0];

const safe = await call('/api/game', token, {
  action: 'assignRole',
  player: player.id,
  role: 'sheriff',
  version: initial.data.version,
});
assert.equal(safe.status, 200, JSON.stringify(safe.data));
assert.equal(safe.data.game.players[0].role, 'sheriff');

const edit = safe.data.game.controls.find((control) =>
  control.action === 'edit' && control.fields[0]?.value === player.id,
);
assert.ok(edit);
const baseFields = Object.fromEntries(edit.fields.map((field) => [field.key, field.value ?? '']));
const second = await call('/api/session', '', { action: 'join', code, name: 'Second Player' });
assert.equal(second.status, 200, JSON.stringify(second.data));
const mergedEdit = await call('/api/game', token, {
  ...baseFields,
  action: 'edit',
  notes: 'Keep this private reminder',
  base: baseFields,
  version: safe.data.game.version,
});
assert.equal(mergedEdit.status, 200, JSON.stringify(mergedEdit.data));
assert.equal(mergedEdit.data.game.players[0].notes, 'Keep this private reminder');

const guarded = await call('/api/game', token, {
  action: 'start',
  version: initial.data.version,
});
assert.equal(guarded.status, 409);
assert.match(guarded.data.error, /table changed/i);

console.log('PASS: safe stale actions and unrelated seat edits apply to the latest table; starting remains guarded.');
