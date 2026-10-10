import { hostFixtureFetch } from './host-fixture.mjs';
// Horrors of Fearville over HTTP: an 18-player table, script selection,
// private night choices (the Wraith's hidden visit), the Sphinx's glimpse,
// Storyteller resolution, dawn, and a public Vigilante declaration.
// Requires the development server (see README).
import assert from 'node:assert/strict';
import { claimSeats } from './claim-seats.mjs';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
async function call(path, token, body) {
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Tables hold 18 players; the nineteenth is refused.
{
  const big = await call('/api/session', '', { action: 'create', name: 'Big Host' });
  for (let i = 0; i < 18; i++) {
    const r = await call('/api/session', '', { action: 'join', code: big.data.code, name: 'Guest ' + i });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const full = await call('/api/session', '', { action: 'join', code: big.data.code, name: 'Guest 19' });
  assert.notEqual(full.status, 200);
  assert.match(full.data.error, /full/);
}

const create = await call('/api/session', '', { action: 'create', name: 'Fear Host' });
assert.equal(create.status, 200, JSON.stringify(create.data));
const host = create.data.token;
const code = create.data.code;
const joined = [];
for (let i = 0; i < 9; i++)
  joined.push(await call('/api/session', '', { action: 'join', code, name: 'Townie ' + (i + 1) }));
assert.ok(joined.every((r) => r.status === 200));
const tokens = joined.map((r) => r.data.token);
await claimSeats(base, tokens);
let state;
async function action(payload, token = host) {
  state = (await call('/api/game', host)).data;
  const r = await call('/api/game', token, { ...payload, version: state.version });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  if (token === host) state = r.data.game;
  return r.data;
}
await action({ action: 'setScript', script: 'horrors' });
assert.equal(state.scriptName, 'Horrors of Fearville');
assert.deepEqual(state.standardCounts, { townsfolk: 5, outsider: 1, traveler: 1, minion: 1, demon: 1 });
// 9 players: 5 Villagers, 1 Fool, 1 Traveler, 1 Haunt, 1 Horror.
const roles = ['watchman', 'doctor', 'detective', 'judge', 'vigilante', 'lostwanderer', 'guardian', 'sphinx', 'wraith'];
const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
for (let i = 0; i < 9; i++)
  await action({ action: 'edit', player: seats[i].id, name: seats[i].name, seat: seats[i].seat, role: roles[i], alive: true, ghost: true });
const T = [];
for (let i = 0; i < 9; i++)
  for (const t of tokens) if ((await call('/api/game', t)).data.me === seats[i].id) T.push(t);
const ids = seats.map((p) => p.id);
await action({ action: 'configure', nightChoice: 5, discovery: 5, discussion: 5, nomination: 30, defense: 5, voting: 5, bluff1: 'bodyguard', bluff2: 'psychic', bluff3: 'hunter', redHerring: ids[1] });
const start = state.controls.find((c) => c.action === 'start');
const values = Object.fromEntries(start.fields.map((f) => [f.key, f.value]));
await action({ ...values, action: 'start', ['charge_' + ids[6]]: ids[3] });
assert.deepEqual(state.issues ?? [], []);

// The Guardian learns their ward; the Traveler is neutral.
const guardian = (await call('/api/game', T[6])).data;
assert.equal(guardian.character.alignment, 'neutral');
assert.ok(guardian.messages.some((m) => /Your ward is Townie 4/.test(m.text)));
// The Sphinx sees every role in a popup; nobody else does.
const sphinx = (await call('/api/game', T[7])).data;
assert.equal(sphinx.glimpse.entries.length, 9);
assert.equal(sphinx.glimpse.entries[8].role, 'Wraith');
assert.equal((await call('/api/game', T[0])).data.glimpse, null);
assert.ok(sphinx.messages.every((m) => !/Wraith/.test(m.text)), 'the glimpse is not stored in Messages');
// The Detective chooses two players during the choice window.
const det = (await call('/api/game', T[2])).data;
assert.equal(det.nightChoice.count, 2);
let r = await call('/api/game', T[2], { action: 'nightChoice', task: det.nightChoice.task, round: det.nightChoice.round, target: ids[1], target2: ids[3] });
assert.equal(r.status, 200, JSON.stringify(r.data));
await wait(5500);
assert.equal((await call('/api/game', T[7])).data.glimpse, null, 'the glimpse closes with the timer');

async function resolveAll() {
  for (let i = 0; i < 30; i++) {
    state = (await call('/api/game', host)).data;
    const death = state.controls.find((c) => c.action === 'resolveDeath');
    if (death) {
      await action({ action: 'resolveDeath', ...Object.fromEntries(death.fields.map((f) => [f.key, f.value])) });
      continue;
    }
    const night = state.controls.find((c) => c.action === 'night');
    if (!night) return;
    const fields = Object.fromEntries(night.fields.map((f) => [f.key, f.value]));
    for (const k of ['target', 'target2']) if (k in fields && !fields[k]) fields[k] = k === 'target' ? ids[0] : ids[2];
    await action({ ...fields, action: 'night', choiceId: state.nightConfirmation?.choice?.id ?? '' });
  }
}
await resolveAll();
const detective = (await call('/api/game', T[2])).data;
assert.ok(detective.messages.some((m) => /Townie 2 and Townie 4: Yes\./.test(m.text)), 'false positive');
await action({ action: 'dawn' });
assert.equal(state.phase, 'discovery');

// Night 2: the Wraith stays hidden from the Watchman.
await action({ action: 'overridePhase', phase: 'dayReview' });
await action({ action: 'finishDay' });
const wraith = (await call('/api/game', T[8])).data;
assert.ok(wraith.nightChoice.flag);
r = await call('/api/game', T[8], { action: 'nightChoice', task: wraith.nightChoice.task, round: wraith.nightChoice.round, target: ids[4], flag: true });
assert.equal(r.status, 200, JSON.stringify(r.data));
const watch = (await call('/api/game', T[0])).data;
r = await call('/api/game', T[0], { action: 'nightChoice', task: watch.nightChoice.task, round: watch.nightChoice.round, target: ids[4] });
assert.equal(r.status, 200, JSON.stringify(r.data));
await wait(5500);
await resolveAll();
const watchman = (await call('/api/game', T[0])).data;
assert.ok(watchman.messages.some((m) => /Nobody visited Townie 5 tonight\./.test(m.text)), 'hidden Wraith');
await action({ action: 'dawn' });
assert.ok(state.dawnAnnouncement.names.includes('Townie 5'));
console.log('Horrors of Fearville integration checks passed.');
