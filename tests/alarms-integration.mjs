import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hostFixtureFetch } from './host-fixture.mjs';
import { assembleGame } from '../lib/game/parts.ts';
import { configureRite, tickRite, beginRiteNight } from '../lib/rite/engine.ts';
const base = process.env.CT_TEST_URL || 'http://127.0.0.1:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
async function call(path, token = '', body) {
  const response = await hostFixtureFetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
function sql(statement) {
  mkdirSync('work', { recursive: true });
  writeFileSync('work/alarm-fixture.sql', statement);
  const result = execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      'wrangler.local.json',
      '--persist-to',
      process.env.CT_D1_PERSIST || '.wrangler/state',
      '--file',
      'work/alarm-fixture.sql',
      '--json',
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(result)[0].results;
}
function raw(code) {
  const row = sql(
    `SELECT state,(SELECT json_group_array(json_array(part,state)) FROM session_parts WHERE code=s.code) AS parts FROM sessions s WHERE code='${code}'`,
  )[0];
  return assembleGame(row.state, JSON.parse(row.parts)).game;
}
function put(g) {
  sql(
    `UPDATE sessions SET state='${JSON.stringify(g).replaceAll("'", "''")}',version=version+1 WHERE code='${g.code}'`,
  );
}
const host = await call('/api/session', '', {
  action: 'create',
  name: 'Alarm host',
});
for (let i = 0; i < 3; i++)
  await call('/api/session', '', {
    action: 'join',
    code: host.code,
    name: `Player ${i}`,
  });
const g = raw(host.code);
g.phase = 'discovery';
g.deadline = Date.now() + 6000;
g.timers.discussion = 60;
put(g);
const initial = await call('/api/game', host.token); // import fixture and schedule
await new Promise((resolve) => setTimeout(resolve, 6500));
// Inspect D1 directly. No GET, POST or connected socket caused the transition.
assert.equal(raw(host.code).phase, 'discussion');
const advanced = await call('/api/game', host.token);
const again = await call('/api/game', host.token);
assert.ok(advanced.version > initial.version);
assert.equal(again.version, advanced.version, 'GET must not save/tick');
g.phase = 'lobby';
g.deadline = null;
g.players.forEach((p) => (p.role = p.shown = 'watchman'));
configureRite(g, {
  action: 'configureRite',
  config: { enabled: true, timed: true, patterns: ['board'], lockSeconds: 0 },
});
tickRite(g, Date.now());
g.phase = 'night';
g.night = 2;
beginRiteNight(g, Date.now() + 6000);
put(g);
await call('/api/game', host.token);
await new Promise((resolve) => setTimeout(resolve, 11500));
const handed = raw(host.code).rite.squads[0].state.turn;
assert.ok(
  handed.log.some((entry) => entry.kind === 'timeout'),
  'turn advances with no clients',
);
assert.ok(handed.cursor > 0);
console.log(
  'PASS: idle phase and optional 5-second Rite turn alarms advance without polling; GET is read-only.',
);
