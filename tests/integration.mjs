import assert from 'node:assert/strict';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  return { status: r.status, data };
}
const create = await call('/api/session', '', {
  action: 'create',
  name: 'Integration Host',
});
assert.equal(create.status, 200, JSON.stringify(create.data));
const host = create.data.token,
  code = create.data.code;
const joined = await Promise.all(
  Array.from({ length: 7 }, (_, i) =>
    call('/api/session', '', { action: 'join', code, name: 'Test ' + (i + 1) }),
  ),
);
assert.ok(
  joined.every((r) => r.status === 200),
  JSON.stringify(joined.map((r) => r.data.error)),
);
const tokens = joined.map((r) => r.data.token);
let state = (await call('/api/game', host)).data;
assert.equal(state.players.length, 7);
assert.equal(new Set(state.players.map((p) => p.seat)).size, 7);
async function action(payload) {
  state = (await call('/api/game', host)).data;
  const r = await call('/api/game', host, {
    ...payload,
    version: state.version,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  state = r.data.game;
  return r.data;
}
const roleIDs = [
  'washerwoman',
  'librarian',
  'chef',
  'empath',
  'fortuneteller',
  'poisoner',
  'imp',
];
for (let i = 0; i < 7; i++) {
  const p = state.players[i];
  await action({
    action: 'edit',
    player: p.id,
    name: p.name,
    seat: p.seat,
    role: roleIDs[i],
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
  bluff1: 'monk',
  bluff2: 'soldier',
  bluff3: 'mayor',
  redHerring: state.players[0].id,
});
await action({ action: 'start' });
const playerStates = await Promise.all(tokens.map((t) => call('/api/game', t)));
// Polls accept simultaneous answers despite an unrelated game version change.
const pollId = playerStates[0].data.nightPoll.id;
const pollAnswers = await Promise.all(
  tokens.map((token, i) =>
    call('/api/game', token, {
      action: 'nightPoll',
      poll: pollId,
      target: state.players[i % 2].id,
      version: -1,
    }),
  ),
);
assert.ok(
  pollAnswers.every((r) => r.status === 200),
  JSON.stringify(pollAnswers),
);
for (let i = 0; i < tokens.length; i++) {
  const v = (await call('/api/game', tokens[i])).data;
  assert.equal(v.nightPoll.answer, state.players[i % 2].id);
  assert.equal(v.previousNightPoll, null);
  assert.ok(!Object.hasOwn(v.nightPoll, 'answers'));
}
assert.equal((await call('/api/game', host)).data.nightPoll, null);
assert.ok(playerStates.every((r) => r.data.character));
for (const r of playerStates) {
  assert.ok(r.data.players.every((p) => !Object.hasOwn(p, 'role')));
  assert.equal(r.data.tasks.length, 0);
  assert.equal(r.data.messages.length, 1);
}
state = (await call('/api/game', host)).data;
const intrude = await call('/api/game', tokens[0], {
  action: 'end',
  winner: 'evil',
  version: state.version,
});
assert.equal(intrude.status, 400);
await action({
  action: 'chat',
  to: state.players[0].id,
  text: 'Private integration clue',
});
const visible = await Promise.all(tokens.map((t) => call('/api/game', t)));
assert.equal(
  visible.filter((r) =>
    r.data.messages.some((m) => m.text === 'Private integration clue'),
  ).length,
  1,
);
const before = (await call('/api/game', host)).data;
const preview = await call('/api/game', host, {
  action: 'night',
  task: before.tasks.find((t) => !t.done).key,
  preview: true,
  version: before.version,
});
assert.equal(preview.status, 200);
const after = (await call('/api/game', host)).data;
assert.equal(before.version, after.version);
assert.equal(before.messages.length, after.messages.length);
await action({
  action: 'dawn',
  override: true,
  reason: 'Integration flow verification',
});
await new Promise((r) => setTimeout(r, 10500));
state = (await call('/api/game', host)).data;
assert.equal(state.phase, 'nomination');
const b = playerStates[1].data.me;
const nomination = await call('/api/game', tokens[0], {
  action: 'nominate',
  target: b,
  version: state.version,
});
assert.equal(nomination.status, 200);
assert.equal(nomination.data.game.phase, 'defense');
await action({ action: 'advance' });
const voteResults = await Promise.all(
  tokens
    .filter((_, i) => i !== 1)
    .map((t, i) => call('/api/game', t, { action: 'vote', yes: i < 4 })),
);
assert.ok(voteResults.every((r) => r.status === 200));
state = (await call('/api/game', host)).data;
assert.equal(state.ballots[0].count, 4);
assert.equal(state.leader.target, b);
const expired = await call('/api/game', 'invalid');
assert.equal(expired.status, 401);
const restored = await call('/api/session', '', {
  action: 'restore',
  recoveryKey: host,
});
assert.equal(restored.status, 200);
assert.equal(restored.data.code, code);
console.log(
  'PASS: parallel joins, unique seats, private roles/messages, permission checks, read-only previews, automatic phase transitions, concurrent ballots, and recovery.',
);
