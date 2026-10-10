import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
import assert from 'node:assert/strict';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function request(path, token, body) {
  const response = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
async function ok(path, token, body) {
  const result = await request(path, token, body);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
const created = await ok('/api/session', '', {
  action: 'create',
  name: 'Nightmare QA',
});
const host = created.token;
const joins = [];
for (let i = 1; i <= 5; i++)
  joins.push(
    await ok('/api/session', '', {
      action: 'join',
      code: created.code,
      name: 'Dream ' + i,
    }),
  );
await claimSeats(base, joins.map((s) => s.token));
let game = await ok('/api/game', host);
async function hostAction(command) {
  game = await ok('/api/game', host);
  const result = await ok('/api/game', host, {
    ...command,
    version: game.version,
  });
  game = result.game;
  return result;
}
await hostAction({ action: 'setScript', script: 'holyMoonStars' });
const roles = ['astronaut', 'prophet', 'spirit', 'nightmare', 'miasma'];
for (let i = 0; i < roles.length; i++)
  await hostAction({
    action: 'edit',
    player: game.players[i].id,
    name: game.players[i].name,
    seat: i + 1,
    role: roles[i],
    alive: true,
    ghost: true,
  });
await hostAction({
  action: 'configure',
  nightChoice: 5,
  discovery: 300,
  discussion: 120,
  nomination: 120,
  defense: 30,
  voting: 30,
});
await hostAction({ action: 'start' });
await new Promise((resolve) => setTimeout(resolve, 5_500));
await hostAction({
  action: 'dawn',
  override: true,
  reason: 'Nightmare integration setup',
});
await hostAction({
  action: 'overridePhase',
  phase: 'dayReview',
  reason: 'Nightmare integration setup',
});
const ids = game.players.map((player) => player.id);
await hostAction({
  action: 'execute',
  target: ids[3],
  override: true,
  reason: 'Nightmare integration setup',
});
game = await ok('/api/game', host);
const death = game.controls.find(
  (control) => control.action === 'resolveDeath',
);
assert.ok(death);
await hostAction({
  action: 'resolveDeath',
  ...Object.fromEntries(
    death.fields.map((field) => [field.key, field.value ?? '']),
  ),
});
await hostAction({
  action: 'finishDay',
  ruling: 'continue',
  override: true,
  reason: 'Nightmare integration setup',
});
async function submit(seat, command) {
  const view = await ok('/api/game', joins[seat - 1].token);
  assert.ok(view.nightChoice, `seat ${seat} should have a choice`);
  return ok('/api/game', joins[seat - 1].token, {
    action: 'nightChoice',
    task: view.nightChoice.task,
    round: view.nightChoice.round,
    ...command,
  });
}
await submit(4, { target: ids[2] });
await submit(3, { target: ids[1] });
await submit(5, { target: ids[0] });

// All initial choices are confirmed, so the Storyteller can bind immediately.
game = await ok('/api/game', host);
const bind = game.controls.find((control) => control.action === 'night');
assert.equal(
  bind.fields.find((field) => field.key === 'task').value,
  'nightmare:' + ids[3],
);
await hostAction({
  action: 'night',
  ...Object.fromEntries(
    bind.fields.map((field) => [field.key, field.value ?? '']),
  ),
  choiceId: game.nightConfirmation.choice.id,
  poisonAcknowledged: true,
});

const nightmare = await ok('/api/game', joins[3].token);
assert.match(nightmare.nightChoice.task, /^nightmareRedirect:/);
assert.match(nightmare.nightChoice.label, /Dream 3 chose a player/);
assert.ok(nightmare.nightChoice.deadline - nightmare.serverNow <= 60_000);
assert.ok(nightmare.nightChoice.deadline > nightmare.serverNow);
const haunted = await ok('/api/game', joins[2].token);
assert.equal(haunted.nightChoice, null);

// The special decision blocks resolution during its 60-second window.
game = await ok('/api/game', host);
const next = game.controls.find((control) => control.action === 'night');
const blocked = await request('/api/game', host, {
  action: 'night',
  ...Object.fromEntries(
    next.fields.map((field) => [field.key, field.value ?? '']),
  ),
  version: game.version,
  choiceId: game.nightConfirmation?.choice?.id ?? '',
  poisonAcknowledged: true,
});
assert.equal(blocked.status, 400);
assert.match(blocked.data.error, /timer to finish/);

await submit(4, { pass: true });
game = await ok('/api/game', host);
const ready = game.controls.find((control) => control.action === 'night');
const resolved = await request('/api/game', host, {
  action: 'night',
  ...Object.fromEntries(
    ready.fields.map((field) => [field.key, field.value ?? '']),
  ),
  version: game.version,
  choiceId: game.nightConfirmation?.choice?.id ?? '',
  poisonAcknowledged: true,
});
assert.equal(resolved.status, 200, JSON.stringify(resolved.data));
console.log(
  'PASS: Nightmare popup starts after the haunted choice, is private, lasts 60 seconds, and closes early on confirmation.',
);
