import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  extractDump,
  importSql,
  tables,
  optionalTables,
} from '../scripts/d1-transfer.mjs';
// Exercise the remote SQL parser too, with synthetic data only.
const parsed = extractDump(
  tables
    .map(
      (t) =>
        `CREATE TABLE "${t}" (value TEXT); INSERT INTO "${t}" VALUES ('O''Brien');`,
    )
    .join('\n'),
);
assert.ok(tables.every((t) => parsed.tables[t][0].value === "O'Brien"));
assert.ok(importSql(parsed).includes("'O''Brien'"));
const legacy = extractDump(
  tables
    .filter((t) => !optionalTables.includes(t))
    .map((t) => `CREATE TABLE "${t}" (value TEXT);`)
    .join('\n'),
);
assert.deepEqual(legacy.tables.player_reports, []);
delete legacy.tables.player_reports;
assert.doesNotThrow(
  () => importSql(legacy),
  'Old nine-table exports remain importable.',
);
assert.throws(
  () =>
    importSql({ ...legacy, tables: { ...legacy.tables, unknown_table: [] } }),
  /Invalid transfer/,
);
assert.throws(
  () =>
    importSql({
      ...legacy,
      tables: { ...legacy.tables, player_reports: null },
    }),
  /Invalid rows/,
);
const temp = mkdtempSync(path.join(tmpdir(), 'fearville-roundtrip-'));
function run(args) {
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `Synthetic local round-trip fixture failed: ${result.stderr}`,
  );
  return result.stdout;
}
const cli = ['node_modules/wrangler/bin/wrangler.js', 'd1'];
const flags = (name) => [
  '--local',
  '--config',
  'wrangler.jsonc',
  '--persist-to',
  path.join(temp, name),
];
try {
  for (const name of ['source', 'target'])
    run([...cli, 'migrations', 'apply', 'DB', ...flags(name)]);
  const fixture = path.join(temp, 'fixture.sql');
  writeFileSync(
    fixture,
    `
    INSERT INTO accounts(id,name,email,created) VALUES ('a','Player O''Brien','a@example.invalid',1),('b','B','b@example.invalid',1);
    INSERT INTO identities(id,account,provider,refresh_token) VALUES ('issuer:a','a','google','encrypted-test-token');
    INSERT INTO account_profiles(account,lobby_name) VALUES ('a','Player O''Brien');
    INSERT INTO account_settings(account) VALUES ('a');
    INSERT INTO friendships VALUES ('a','b','accepted',1,2);
    INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended) VALUES ('g','123456','a','Host','good','test',5,1,1,1,2);
    INSERT INTO game_players(game,player,account,name,role,team,won,alive) VALUES ('g','p','b','B','watchman','good',1,1);
    INSERT INTO storyteller_ratings VALUES ('g','b','a',5,'Great\nnight',2);
    INSERT INTO tutorial_progress VALUES ('a','intro','completed',2);
    INSERT INTO player_reports(id,kind,reason,reporter_account,target_account,target_name,content,created) VALUES ('r','player','other','a','b','B','reported handle',2);
    INSERT INTO sessions(code,state,version,created) VALUES ('123456','{}',0,1);
    INSERT INTO session_parts(code,part,state,rev) VALUES ('123456','chat:00000','[]',1);
    INSERT INTO session_snapshots(code,id,state) VALUES ('123456','snapshot','{}');
    INSERT INTO account_sessions(hash,account,expires) VALUES ('private','a',99999999);
  `,
  );
  run([...cli, 'execute', 'DB', ...flags('source'), '--file', fixture]);
  const file = path.join(temp, 'export.json');
  run([
    'scripts/export-d1.mjs',
    '--database',
    'DB',
    '--mode',
    'local',
    '--file',
    file,
    '--persist-to',
    path.join(temp, 'source'),
  ]);
  const dump = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(dump.tables), tables);
  run([
    'scripts/import-d1.mjs',
    '--database',
    'DB',
    '--mode',
    'local',
    '--file',
    file,
    '--persist-to',
    path.join(temp, 'target'),
  ]);
  for (const table of [
    ...tables,
    'sessions',
    'session_parts',
    'session_snapshots',
    'account_sessions',
  ]) {
    const query = (name) =>
      JSON.parse(
        run([
          ...cli,
          'execute',
          'DB',
          ...flags(name),
          '--json',
          '--command',
          `SELECT * FROM "${table}" ORDER BY 1;`,
        ]),
      )[0].results;
    if (tables.includes(table))
      assert.deepEqual(query('target'), query('source'), table);
    else assert.equal(query('target').length, 0, table);
  }
  const repeat = spawnSync(process.execPath, [
    'scripts/import-d1.mjs',
    '--database',
    'DB',
    '--mode',
    'local',
    '--file',
    file,
    '--persist-to',
    path.join(temp, 'target'),
  ]);
  assert.notEqual(repeat.status, 0, 'Import refuses a nonempty target.');
  console.log(
    `PASS: all ${tables.length} durable tables round-trip with identical rows; live sessions, parts, snapshots and login credentials excluded; legacy exports supported; nonempty target rejected.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
