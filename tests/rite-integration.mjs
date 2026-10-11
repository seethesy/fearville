import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { hostFixtureFetch } from './host-fixture.mjs';
import { claimSeats } from './claim-seats.mjs';
import { beginNight } from '../lib/game/engine.ts';
import { generateBoard, boardMoves } from '../lib/rite/board.ts';
import { generateLab, solveLab } from '../lib/rite/lab.ts';
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
  if (expected === 200 && path === '/api/rite') {
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.ok(response.headers.get('cache-control').includes('private'));
  }
  return data;
}
function sql(query) {
  mkdirSync('work', { recursive: true });
  const file = 'work/rite-http-fixture.sql';
  writeFileSync(file, query);
  const output = execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
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
const host = await call('/api/session', '', {
    action: 'create',
    name: 'Rite HTTP QA',
  }),
  seats = [];
for (let i = 0; i < 12; i++)
  seats.push(
    await call('/api/session', '', {
      action: 'join',
      name: `Rite ${i + 1}`,
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
let hr = await call('/api/rite', host.token);
hr = await call('/api/rite', host.token, {
  action: 'configureRite',
  version: hr.version,
  config: { enabled: true },
  plans,
});
assert.equal(hr.rite.plans.length, 4);
await call('/api/rite', seats[0].token, { action: 'riteForce' }, 400);
const raw = JSON.parse(
  sql(`SELECT state FROM sessions WHERE code='${host.code}'`)[0].state,
);
raw.players.forEach((p, i) => {
  p.role = p.shown = i === 0 ? 'basilisk' : i === 11 ? 'monster' : 'vigilante';
  p.used = true;
  p.alive = i !== 7;
});
raw.rite.prepared = Object.fromEntries(
  plans
    .filter((p) => ['board', 'lab'].includes(p.kind))
    .map((p) => [
      `${p.id}:${p.kind}:3`,
      p.kind === 'board'
        ? generateBoard('http-board', 3)
        : generateLab('http-lab', 3),
    ]),
);
beginNight(raw, Date.now());
beginNight(raw, Date.now());
function persist() {
  sql(
    `UPDATE sessions SET state='${JSON.stringify(raw).replaceAll("'", "''")}',version=version+1 WHERE code='${host.code}'`,
  );
}
persist();
const tokenFor = (id) => seats[hg.players.findIndex((p) => p.id === id)].token;
hr = await call('/api/rite', host.token);
const grid = hr.rite.squads.find((s) => s.kind === 'grid');
let own = await call('/api/rite', seats[0].token);
assert.equal(own.rite.puzzle.phase, 'lock');
assert.equal(own.rite.puzzle.clues.filter((c) => c.hidden).length, 2);
assert.ok(own.rite.puzzle.clues.some((c) => c.forged));
assert.ok(!JSON.stringify(own.rite).includes('solution'));
await call(
  '/api/rite',
  seats[0].token,
  {
    action: 'riteGridSubmit',
    epoch: own.rite.epoch,
    night: 2,
    solution: grid.state.solution,
  },
  400,
);
await call(
  '/api/game',
  host.token,
  { action: 'dawn', version: hr.version },
  400,
);
raw.rite.lockUntil = Date.now() - 2000;
raw.nightChoiceDeadline = raw.rite.lockUntil;
for (const s of raw.rite.squads)
  if (s.state.turn) {
    s.state.turn.start = raw.rite.lockUntil;
    s.state.turn.deadline = Date.now() + 30000;
  }
persist();
const privateKeys = [
  'order',
  'cursor',
  'snapshots',
  'ballots',
  'history',
  'distance',
  'par',
  'target',
  'decoys',
  'seed',
  'preparing',
  'solution',
  'submissions',
];
for (const seat of seats) {
  const v = await call('/api/rite', seat.token);
  const keys = JSON.stringify(v.rite);
  for (const key of privateKeys) assert.ok(!keys.includes(`"${key}":`), key);
  assert.equal(v.rite.squad.members.length, 3);
}
// Cross-platform player writes deliberately ignore the global optimistic version:
// independent submissions must survive simultaneous polling/other-player writes.
own = await call('/api/rite', seats[0].token);
await Promise.all(
  grid.members.slice(0, 2).map((id) =>
    call('/api/rite', tokenFor(id), {
      action: 'riteGridSubmit',
      version: 0,
      epoch: own.rite.epoch,
      night: 2,
      solution: grid.state.solution,
    }),
  ),
);
const board = raw.rite.squads.find((s) => s.kind === 'board'),
  lab = raw.rite.squads.find((s) => s.kind === 'lab');
let mover = board.state.turn.order[0];
const bv = await call('/api/rite', tokenFor(mover));
const move = boardMoves(bv.rite.puzzle.blocks)[0].move;
const moved = await call('/api/rite', tokenFor(mover), {
  action: 'riteBoardMove',
  epoch: bv.rite.epoch,
  night: 2,
  turn: bv.rite.puzzle.turn,
  ...move,
});
assert.equal(moved.rite.puzzle.phase, 'turn');
assert.ok(moved.rite.puzzle.deadline);
await call(
  '/api/rite',
  tokenFor(mover),
  {
    action: 'riteBoardMove',
    epoch: bv.rite.epoch,
    night: 2,
    turn: bv.rite.puzzle.turn,
    ...move,
  },
  400,
);
const anotherMove = boardMoves(moved.rite.puzzle.blocks)[0].move;
const movedAgain = await call('/api/rite', tokenFor(mover), {
  action: 'riteBoardMove',
  epoch: moved.rite.epoch,
  night: 2,
  turn: moved.rite.puzzle.turn,
  ...anotherMove,
});
assert.equal(movedAgain.rite.puzzle.phase, 'turn');
await call('/api/rite', tokenFor(mover), {
  action: 'ritePass',
  epoch: movedAgain.rite.epoch,
  night: 2,
  turn: movedAgain.rite.puzzle.turn,
});
const next = await call('/api/rite', tokenFor(board.state.turn.order[1]));
assert.equal(next.rite.puzzle.phase, 'turn');
mover = lab.state.turn.order[0];
let lv = await call('/api/rite', tokenFor(mover));
const optimal = solveLab(lv.rite.puzzle.vials)[0];
lv = await call('/api/rite', tokenFor(mover), {
  action: 'riteLabPour',
  epoch: lv.rite.epoch,
  night: 2,
  turn: lv.rite.puzzle.turn,
  ...optimal,
});
assert.equal(lv.rite.puzzle.phase, 'turn');
const anotherPour = solveLab(lv.rite.puzzle.vials)[0];
lv = await call('/api/rite', tokenFor(mover), {
  action: 'riteLabPour',
  epoch: lv.rite.epoch,
  night: 2,
  turn: lv.rite.puzzle.turn,
  ...anotherPour,
});
assert.equal(lv.rite.puzzle.phase, 'turn');
const caller = mover;
const called = await call('/api/rite', tokenFor(caller), {
  action: 'riteLabCall',
  epoch: lv.rite.epoch,
  night: 2,
  turn: lv.rite.puzzle.turn,
  kind: 'undo',
});
assert.ok(called.rite.puzzle.vote);
await Promise.all(
  lab.members
    .filter((id) => id !== caller)
    .map(async (id) => {
      const v = await call('/api/rite', tokenFor(id));
      assert.ok(!('ballots' in v.rite.puzzle.vote));
      return call('/api/rite', tokenFor(id), {
        action: 'riteLabBallot',
        epoch: v.rite.epoch,
        night: 2,
        vote: v.rite.puzzle.vote.id,
        yes: true,
      });
    }),
);
assert.equal(
  (await call('/api/rite', tokenFor(caller))).rite.puzzle.voteResult.passed,
  true,
);
hr = await call('/api/rite', host.token);
await call('/api/rite', host.token, {
  action: 'riteForce',
  version: hr.version,
});
for (let i = 0; i < 30; i++) {
  hg = await call('/api/game', host.token);
  if (!hg.controls.some((c) => c.action === 'nightSkip')) break;
  await call('/api/game', host.token, {
    action: 'nightSkip',
    version: hg.version,
  });
}
hg = await call('/api/game', host.token);
hg = (
  await call('/api/game', host.token, { action: 'dawn', version: hg.version })
).game;
assert.ok(hg.rite.squads.find((s) => s.kind === 'grid').completeNight);
assert.equal(
  hg.rite.status,
  'open',
  'One of four vigils does not reach the threshold.',
);
assert.ok(!hg.log.some((l) => l.text === 'The Rite is complete.'));
const outsider = await call('/api/rite', seats[3].token);
assert.ok(!JSON.stringify(outsider.rite).includes('completeNight'));
// Rewind invalidates stale player requests and restores both game and Rite JSON.
const epoch = own.rite.epoch;
hg = (
  await call('/api/game', host.token, { action: 'undo', version: hg.version })
).game;
assert.notEqual(hg.rite.epoch, epoch);
await call(
  '/api/rite',
  seats[0].token,
  { action: 'riteGridSubmit', epoch, night: 2, solution: grid.state.solution },
  400,
);
raw.sandbox = true;
raw.players[0].dummy = true;
persist();
const preview = await call('/api/rite?pov=' + raw.players[0].id, host.token);
assert.equal(preview.me, raw.players[0].id);
assert.equal(preview.rite.host, false);
const ordinary = await call(
  '/api/rite?pov=' + raw.players[0].id,
  seats[1].token,
);
assert.equal(ordinary.me, raw.players[1].id);
console.log(
  'PASS: production Worker HTTP, setup, private payloads, lock/dawn gating, concurrent submissions, repeated moves, timed handoff, stale retries, anonymous unanimous votes, quiet completion and rewind.',
);
