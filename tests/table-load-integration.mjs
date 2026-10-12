import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostFixtureFetch } from './host-fixture.mjs';
import { assembleGame } from '../lib/game/parts.ts';
import { configureRite, tickRite, beginRiteNight } from '../lib/rite/engine.ts';
import { snapshot, execute, setPhase } from '../lib/game/engine.ts';
import { boardMoves } from '../lib/rite/board.ts';
import { pour } from '../lib/rite/lab.ts';

const base = process.env.CT_TEST_URL || 'http://127.0.0.1:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const timings = [];
async function call(path, token = '', body) {
  const start = performance.now();
  const response = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      // Fixture SQL subprocesses can outlive workerd's idle HTTP connection.
      // Use a fresh connection for each measured request, as separate phones do.
      Connection: 'close',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch((cause) => {
    throw new Error(`${path} ${body?.action ?? 'GET'} failed`, { cause });
  });
  const data = await response.json();
  timings.push(performance.now() - start);
  assert.equal(
    response.status,
    200,
    `${path} ${body?.action ?? 'GET'}: ${JSON.stringify(data)}`,
  );
  return data;
}
function sql(statement) {
  mkdirSync('work', { recursive: true });
  const file = 'work/table-load-fixture.sql';
  writeFileSync(file, statement);
  const result = execFileSync(
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
  return JSON.parse(result)[0].results;
}
// Tables are stored as a core row plus parts (lib/game/parts.ts). Writing a
// whole blob back (put) is the old layout, which the server reads and converts.
function raw(code) {
  const [row] = sql(
    `SELECT state, (SELECT json_group_array(json_array(part, state)) FROM session_parts WHERE code=s.code) AS parts FROM sessions s WHERE code='${code}'`,
  );
  return assembleGame(row.state, JSON.parse(row.parts)).game;
}
function put(game) {
  const state = JSON.stringify(game);
  const statements = [
    `UPDATE sessions SET state='',version=version+1 WHERE code='${game.code}'`,
  ];
  for (let offset = 0; offset < state.length; offset += 40000)
    statements.push(
      `UPDATE sessions SET state=state||'${state.slice(offset, offset + 40000).replaceAll("'", "''")}' WHERE code='${game.code}'`,
    );
  sql(statements.join(';\n') + ';');
}
const host = await call('/api/session', '', {
  action: 'create',
  name: 'Load test host',
});
const other = await call('/api/session', '', {
  action: 'create',
  name: 'Independent table',
});
const seats = [];
for (let i = 0; i < 15; i++)
  seats.push(
    await call('/api/session', '', {
      action: 'join',
      code: host.code,
      name: `Player ${i + 1}`,
    }),
  );
const game = raw(host.code);
game.players.forEach((p, i) => {
  p.seat = i + 1;
  p.role = p.shown = i === 14 ? 'monster' : 'watchman';
  p.notes = 'Historical reminder. '.repeat(5);
});
configureRite(game, {
  action: 'configureRite',
  config: { enabled: true },
  plans: ['board', 'lab', 'board', 'lab', 'board'].map((kind, i) => ({
    id: `vigil-${i}`,
    kind,
    members: game.players.slice(i * 3, i * 3 + 3).map((p) => p.id),
  })),
});
tickRite(game, Date.now());
game.phase = 'night';
game.night = 2;
game.gameStartedAt = Date.now();
beginRiteNight(game, Date.now());
for (let i = 0; i < 40; i++) snapshot(game, `Legacy decision ${i}`, Date.now());
const legacyBytes = JSON.stringify(game).length;
put(game);
console.log(`Migrating ${legacyBytes} bytes of legacy table state`);
await call('/api/game', host.token, {
  action: 'chat',
  to: 'all',
  text: 'Migrate saved decisions',
  messageId: randomUUID(),
});
const compact = raw(host.code);
assert.ok(compact.history.every((h) => h.before === ''));
assert.equal(
  sql(
    `SELECT COUNT(*) AS n FROM session_snapshots WHERE code='${host.code}'`,
  )[0].n,
  40,
);
assert.ok(JSON.stringify(compact).length < legacyBytes / 5);
const initial = await call('/api/game', host.token);
const tokenFor = (id) =>
  seats[game.players.findIndex((p) => p.id === id)].token;
timings.length = 0;
for (let round = 0; round < 3; round++) {
  console.log(`Concurrent burst ${round + 1}/3`);
  const current = await call('/api/rite', host.token);
  const actions = seats.flatMap((seat, i) => [
    call('/api/game', seat.token, {
      action: 'chat',
      text: `burst-${round}-${i}`,
      messageId: randomUUID(),
      version: initial.version,
    }),
    call('/api/game', seat.token, {
      action: 'saveNotebook',
      started: game.gameStartedAt,
      notebook: { text: `notes-${round}-${i}`, roles: {}, players: {} },
      version: initial.version,
    }),
    call('/api/game', seat.token),
  ]);
  for (const squad of current.rite.squads) {
    const state = squad.state,
      turn = state.turn;
    const move =
      state.type === 'board'
        ? { action: 'riteBoardMove', ...boardMoves(state.blocks)[0].move }
        : (() => {
            for (const from of state.vials)
              for (const to of state.vials)
                if (pour(state.vials, { from: from.id, to: to.id }))
                  return { action: 'riteLabPour', from: from.id, to: to.id };
            return { action: 'ritePass' };
          })();
    actions.push(
      call('/api/rite', tokenFor(turn.order[turn.cursor]), {
        ...move,
        turn: turn.token,
        epoch: current.rite.epoch,
        night: game.night,
      }),
    );
  }
  actions.push(call('/api/game', other.token));
  await Promise.all(actions);
  const saved = raw(host.code);
  for (let i = 0; i < 15; i++) {
    assert.ok(saved.messages.some((m) => m.text === `burst-${round}-${i}`));
    assert.equal(
      saved.notebooks[game.players[i].id].text,
      `notes-${round}-${i}`,
    );
  }
  assert.ok(
    saved.rite.squads.every((s) => s.state.turn.log.length >= round + 1),
  );
}
// Shared ballots still need an ordered commit. Every simultaneous vote must
// survive while independent messages continue to arrive.
const voting = raw(host.code);
voting.phase = 'nomination';
voting.day = 2;
execute(
  voting,
  { id: voting.players[0].id, host: false },
  { action: 'nominate', target: voting.players[14].id },
  Date.now(),
);
setPhase(voting, 'voting', Date.now(), 300);
put(voting);
await Promise.all(
  seats.slice(0, 14).flatMap((seat, i) => [
    call('/api/game', seat.token, {
      action: 'vote',
      ballot: voting.active.id,
      yes: true,
      version: initial.version,
    }),
    call('/api/game', seat.token, {
      action: 'chat',
      text: `voting-${i}`,
      messageId: randomUUID(),
      version: initial.version,
    }),
  ]),
);
const afterVote = raw(host.code);
assert.equal(Object.keys(afterVote.ballots.at(-1).votes).length, 14);
assert.equal(
  afterVote.messages.filter((m) => m.text.startsWith('voting-')).length,
  14,
);
// Restoring a separately stored snapshot preserves renamed membership and
// independently saved notes/messages, including after an unrelated update.
const hg = await call('/api/game', host.token);
const undo = hg.controls.find((c) => c.action === 'undo');
await call('/api/session', host.token, {
  action: 'rename',
  name: 'Renamed host',
});
await call('/api/game', host.token, {
  action: 'undo',
  ...Object.fromEntries(undo.fields.map((f) => [f.key, f.value])),
  version: hg.version,
});
const restored = raw(host.code);
assert.equal(restored.hostName, 'Renamed host');
assert.equal(
  restored.messages.filter((m) => m.text.startsWith('burst-')).length,
  45,
);
assert.equal(restored.notebooks[game.players[0].id].text, 'notes-2-0');
timings.sort((a, b) => a - b);
console.log(
  `PASS: 15 players, 5 vigils, 3 simultaneous bursts, 14 simultaneous votes, independent table reads, snapshot migration and undo. ${timings.length} requests; p95 ${Math.round(timings[Math.floor(timings.length * 0.95)])} ms, max ${Math.round(timings.at(-1))} ms. Live record ${JSON.stringify(compact).length} bytes (was ${legacyBytes}).`,
);
