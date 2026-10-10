import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
// Holy Moon and Stars over HTTP: script selection, private night choices,
// Storyteller resolution, the death queue, dawn, and channel privacy.
// Requires the development server (see README).
import assert from 'node:assert/strict';
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
const create = await call('/api/session', '', { action: 'create', name: 'Moon Host' });
assert.equal(create.status, 200, JSON.stringify(create.data));
const host = create.data.token;
const code = create.data.code;
const joined = [];
for (let i = 0; i < 8; i++)
  joined.push(await call('/api/session', '', { action: 'join', code, name: 'Star ' + (i + 1) }));
assert.ok(joined.every((r) => r.status === 200), JSON.stringify(joined.map((r) => r.data.error)));
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
await action({ action: 'setScript', script: 'holyMoonStars' });
assert.equal(state.scriptName, 'Holy Moon and Stars');
const roles = ['constellation', 'astrologist', 'mystic', 'medium', 'diviner', 'insomniac', 'nightmare', 'miasma'];
const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
for (let i = 0; i < 8; i++)
  await action({ action: 'edit', player: seats[i].id, name: seats[i].name, seat: seats[i].seat, role: roles[i], alive: true, ghost: true });
const tokenFor = async (i) => {
  for (const t of tokens) if ((await call('/api/game', t)).data.me === seats[i].id) return t;
  throw Error('no token');
};
const T = [];
for (let i = 0; i < 8; i++) T.push(await tokenFor(i));
await action({ action: 'configure', nightChoice: 5, discovery: 5, discussion: 5, nomination: 30, defense: 5, voting: 5, bluff1: 'stargazer', bluff2: 'spirit', bluff3: 'priest' });
assert.deepEqual(state.issues, []);
await action({ action: 'start' });
// Players see only their own character, and the Constellation is asked for three players.
const con = (await call('/api/game', T[0])).data;
assert.equal(con.character.name, 'Constellation');
assert.equal(con.nightChoice.count, 3);
assert.ok(con.players.every((p) => !Object.hasOwn(p, 'role')));
const ids = seats.map((p) => p.id);
let r = await call('/api/game', T[0], { action: 'nightChoice', task: con.nightChoice.task, round: con.nightChoice.round, target: ids[1], target2: ids[4], target3: ids[5] });
assert.equal(r.status, 200, JSON.stringify(r.data));
const astro = (await call('/api/game', T[1])).data;
r = await call('/api/game', T[1], { action: 'nightChoice', task: astro.nightChoice.task, round: astro.nightChoice.round, target: ids[5], target2: ids[6], target3: ids[7] });
assert.equal(r.status, 200, JSON.stringify(r.data));
const div = (await call('/api/game', T[4])).data;
assert.equal(div.nightChoice.text, true);
r = await call('/api/game', T[4], { action: 'nightChoice', task: div.nightChoice.task, round: div.nightChoice.round, text: 'Who should I trust?' });
assert.equal(r.status, 200, JSON.stringify(r.data));
const mia = (await call('/api/game', T[7])).data;
r = await call('/api/game', T[7], { action: 'nightChoice', task: mia.nightChoice.task, round: mia.nightChoice.round, target: ids[3] });
assert.equal(r.status, 200, JSON.stringify(r.data));
// Night actions wait for the choice window.
r = await call('/api/game', host, { action: 'night', task: state.tasks[0].key, version: (await call('/api/game', host)).data.version });
assert.equal(r.status, 400);
await wait(5500);
// The Storyteller confirms each task with the form's defaults.
async function confirmNext(extra = {}) {
  state = (await call('/api/game', host)).data;
  const c = state.controls.find((x) => x.action === 'night' || x.action === 'resolveDeath');
  const values = Object.fromEntries(c.fields.map((f) => [f.key, f.value ?? '']));
  if (c.action === 'night') {
    values.choiceId = state.nightConfirmation?.choice?.id ?? '';
    values.poisonAcknowledged = true;
  }
  return action({ ...values, ...extra, action: c.action });
}
await confirmNext();
await confirmNext();
await confirmNext();
const constellationMsg = (await call('/api/game', T[0])).data.messages.at(-1).text;
assert.match(constellationMsg, /Your Constellation: Star 2, Star 5, Star 6/);
await confirmNext();
assert.match((await call('/api/game', T[1])).data.messages.at(-1).text, /One of these characters belongs to one of Star 6, Star 7, Star 8/);
// The Mystic did not choose; the Storyteller picks a neighbor.
await confirmNext({ target: ids[1] });
await confirmNext({ target: ids[0] });
assert.match((await call('/api/game', T[4])).data.messages.at(-1).text, /Who should I trust\?/);
await confirmNext();
await confirmNext();
assert.match((await call('/api/game', T[5])).data.messages.at(-1).text, /Visited by: Star 1, Star 2\. Neighbors who visited someone: 0/);
await action({ action: 'dawn' });
assert.equal(state.phase, 'discovery');
// Day: execute the Nightmare through the death queue.
await action({ action: 'overridePhase', phase: 'dayReview', reason: 'integration' });
await action({ action: 'execute', target: ids[6], override: true, reason: 'integration' });
state = (await call('/api/game', host)).data;
assert.ok(state.controls.some((c) => c.action === 'resolveDeath'));
await confirmNext();
assert.equal(state.players.find((p) => p.id === ids[6]).alive, false);
await action({ action: 'finishDay', ruling: 'continue', override: true, reason: 'integration' });
assert.equal(state.phase, 'night');
// Night 2: plague first, then the Nightmare binds, then the Medium reaches the dead.
assert.deepEqual(state.tasks.slice(0, 3).map((t) => t.key.split(':')[0]), ['plague', 'nightmare', 'medium']);
await wait(5500);
await confirmNext();
await confirmNext();
assert.equal((await call('/api/game', host)).data.players.find((p) => p.id === ids[3]).alive, false);
const mediumNeighbors = state.players.filter((p) => p.poisoned).map((p) => p.name).sort();
assert.deepEqual(mediumNeighbors, ['Star 3', 'Star 5']);
const mystic = (await call('/api/game', T[2])).data;
assert.ok(mystic.players.find((p) => p.id === ids[3]).alive, 'night deaths stay private');
console.log('PASS: Holy Moon and Stars script selection, private choices (players, question), Storyteller resolution, death queue, plague order, and private night deaths.');
