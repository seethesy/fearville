// FEAR-30: leak tests over HTTP. Every seated player's /api/game, /api/rite
// and /api/tutorials payloads carry no other player's character, no other
// vigil's pattern and no other role's tips; a Drunk receives the tips of the
// role they believe; only the Sphinx (this script's grimoire peek, the Spy's
// equivalent) receives a glimpse. Requires the local API server and local D1
// (npm run test:integration).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
import { assembleGame } from '../lib/game/parts.ts';
import { beginNight } from '../lib/game/engine.ts';
import { ROLE_TIPS, roleTips } from '../lib/game/role-tips.ts';
import { PATTERNS } from '../lib/rite/types.ts';
import { generateBoard } from '../lib/rite/board.ts';
import { generateLab } from '../lib/rite/lab.ts';

const base = process.env.CT_TEST_URL || 'http://localhost:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
async function call(path, token = '', body, expected = 200) {
  const response = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
function sql(query) {
  mkdirSync('work', { recursive: true });
  const file = 'work/tutorials-qa-fixture.sql';
  writeFileSync(file, query);
  const output = execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--persist-to',
      process.env.CT_D1_PERSIST || '.wrangler/state',
      '--config',
      'wrangler.local.json',
      '--file',
      file,
      '--json',
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(output)[0].results;
}

// Twelve players, four vigils of three (one per pattern).
const ROLES = [
  'doctor',
  'detective',
  'watchman',
  'psychic',
  'judge',
  'drunk',
  'hag',
  'vigilante',
  'teacher',
  'basilisk',
  'sphinx',
  'monster',
];
const BELIEVED = { drunk: 'hunter' };
const host = await call('/api/session', '', {
    action: 'create',
    name: 'Tutorials QA',
  }),
  seats = [];
for (let i = 0; i < ROLES.length; i++)
  seats.push(
    await call('/api/session', '', {
      action: 'join',
      name: `Seat ${i + 1}`,
      code: host.code,
    }),
  );
await claimSeats(
  base,
  seats.map((s) => s.token),
);
let hg = await call('/api/game', host.token);
const kinds = ['grid', 'ritual', 'board', 'lab'],
  plans = kinds.map((kind, i) => ({
    id: `vigil-${kind}`,
    kind,
    members: hg.players.slice(i * 3, i * 3 + 3).map((p) => p.id),
  }));
const hr = await call('/api/rite', host.token);
await call('/api/rite', host.token, {
  action: 'configureRite',
  version: hr.version,
  config: { enabled: true },
  plans,
});

const stored = sql(
  `SELECT state, (SELECT json_group_array(json_array(part, state)) FROM session_parts WHERE code=s.code) AS parts FROM sessions s WHERE code='${host.code}'`,
)[0];
const raw = assembleGame(stored.state, JSON.parse(stored.parts)).game;
raw.players.forEach((p, i) => {
  p.role = ROLES[i];
  p.shown = BELIEVED[ROLES[i]] ?? ROLES[i];
});
function persist() {
  sql(
    `UPDATE sessions SET state='${JSON.stringify(raw).replaceAll("'", "''")}',version=version+1 WHERE code='${host.code}'`,
  );
}
const script = raw.script ?? 'horrors';
const ownKind = (id) => plans.find((p) => p.members.includes(id)).kind;

async function checkSeats(label) {
  const allTips = Object.entries(ROLE_TIPS[script]);
  for (const [i, seat] of seats.entries()) {
    const id = hg.players[i].id;
    const real = ROLES[i],
      believed = BELIEVED[real] ?? real;
    const game = await call('/api/game', seat.token);
    const rite = await call('/api/rite', seat.token);
    const tutorials = await call('/api/tutorials', seat.token);
    // Tutorial progress carries nothing about the game; guests keep it on
    // the device.
    assert.deepEqual(tutorials, { account: false, seen: [] }, label);
    // Tips: exactly the believed role's, and no other role's.
    assert.deepEqual(
      game.character.tips,
      roleTips(script, believed),
      `${label}: seat ${i + 1} tips`,
    );
    const own = new Set(roleTips(script, believed));
    const wire = JSON.stringify(game) + JSON.stringify(rite);
    for (const [role, tips] of allTips)
      for (const tip of tips)
        if (!own.has(tip))
          assert.ok(
            !wire.includes(JSON.stringify(tip).slice(1, -1)),
            `${label}: seat ${i + 1} (${real}) receives a tip for ${role}`,
          );
    // Characters: only the Sphinx's glimpse may list them.
    if (game.glimpse)
      assert.equal(real, 'sphinx', `${label}: seat ${i + 1} gets a glimpse`);
    const rest =
      JSON.stringify({ ...game, glimpse: null }) + JSON.stringify(rite);
    assert.ok(
      !/"(role|shown|acts)":/.test(rest),
      `${label}: seat ${i + 1} receives character fields`,
    );
    if (real !== believed)
      assert.notEqual(game.character.name.toLowerCase(), real, label);
    // Night Rite: own vigil and pattern only.
    const kind = ownKind(id);
    assert.equal(game.rite.squad.kind, kind, label);
    assert.equal(rite.rite.squad.kind, kind, label);
    for (const [other, title] of Object.entries(PATTERNS))
      if (other !== kind) {
        assert.ok(!wire.includes(title), `${label}: seat ${i + 1} ${other}`);
        assert.ok(!wire.includes(`"vigil-${other}"`), label);
      }
  }
}

// Night 1: vigils known, guides due, puzzles not yet open.
beginNight(raw, Date.now());
persist();
hg = await call('/api/game', host.token);
assert.equal(hg.phase, 'night');
assert.equal(hg.night, 1);
await checkSeats('night 1');

// Night 2: the Rite opens.
raw.rite.prepared = Object.fromEntries(
  plans
    .filter((p) => ['board', 'lab'].includes(p.kind))
    .map((p) => [
      `${p.id}:${p.kind}:3`,
      p.kind === 'board'
        ? generateBoard('qa-board', 3)
        : generateLab('qa-lab', 3),
    ]),
);
beginNight(raw, Date.now());
persist();
hg = await call('/api/game', host.token);
assert.equal(hg.night, 2);
await checkSeats('night 2');

// The Storyteller still sees everything they need.
assert.ok(hg.players.every((p) => p.role));
assert.equal((await call('/api/rite', host.token)).rite.squads.length, 4);

console.log('Tutorials QA integration test passed.');
