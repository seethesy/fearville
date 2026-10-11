import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { newGame, newPlayer, type Command, type Game } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { independentCommand } from '../lib/game/scoped-update.ts';
import {
  SESSION_COLUMNS,
  loadStored,
  prepareWrite,
  runWrite,
  saveIndependentParts,
  createStatements,
  type SessionRow,
} from '../lib/game/part-store.ts';

// A D1-compatible wrapper over node:sqlite so the real SQL runs in tests.
// Batches run in one transaction and roll back on any error, like D1.
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort())
    for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint'))
      if (statement.trim()) sqlite.exec(statement);
  type Value = string | number | null;
  const statement = (sql: string, params: Value[] = []) => ({
    sql,
    params,
    bind: (...values: unknown[]) => statement(sql, values as Value[]),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
    first: async () => (sqlite.prepare(sql).get(...params) ?? null) as never,
  });
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = list.map((s) => ({ meta: { changes: Number(sqlite.prepare(s.sql).run(...s.params).changes) } }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db: db as unknown as D1Database, sqlite };
}

async function load(db: D1Database, code: string) {
  const row = await db
    .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.code = ?`)
    .bind(code)
    .first<SessionRow>();
  return loadStored(row!);
}
async function save(db: D1Database, g: Game, version: number) {
  const results = await runWrite(db, prepareWrite(db, g, version));
  return !!results && results[0].meta.changes === 1;
}
function table() {
  const g = newGame('PARTS1', 'Host');
  g.players = Array.from({ length: 6 }, (_, i) => ({ ...newPlayer(`Player ${i}`, i + 1), role: 'watchman', shown: 'watchman' }));
  g.gameStartedAt = 1;
  return g;
}
async function independent(db: D1Database, code: string, actorId: string, command: Command) {
  const { game } = await load(db, code);
  const before = structuredClone(game);
  const actor = { id: actorId, host: false };
  execute(game, actor, command, 50);
  const update = independentCommand(before, game, actor, command);
  assert.ok(update, `${command.action} should be independent`);
  return saveIndependentParts(db, game, update);
}

void test('old blob rows load unchanged and convert to parts on the next save', async () => {
  const { db, sqlite } = d1();
  const g = table();
  g.messages.push({ id: crypto.randomUUID(), from: g.players[0].id, to: 'all', text: 'Hello', at: 2, kind: 'chat' } as Game['messages'][number]);
  g.log.push({ id: 'l1', text: 'Joined', at: 1, public: true });
  g.notebooks = { [g.players[1].id]: { text: 'Mine', roles: {}, players: {} } } as never;
  sqlite.prepare('INSERT INTO sessions (code,state,version,created) VALUES (?,?,4,1)').run(g.code, JSON.stringify(g));

  const old = await load(db, g.code);
  assert.equal(old.legacy, true);
  assert.equal(old.game.messages[0].text, 'Hello');
  assert.ok(await save(db, old.game, 4));

  const core = JSON.parse((sqlite.prepare('SELECT state FROM sessions').get() as { state: string }).state);
  assert.deepEqual(core.messages, []);
  const parts = (sqlite.prepare('SELECT part FROM session_parts ORDER BY part').all() as { part: string }[]).map((r) => r.part);
  assert.deepEqual(parts, ['chat:00000', 'log:00000', `notes:${g.players[1].id}`]);

  const converted = await load(db, g.code);
  assert.equal(converted.legacy, false);
  assert.equal(converted.version, 5);
  assert.deepEqual(converted.game, old.game);
});

void test('chat and notebook saves do not conflict with core actions', async () => {
  const { db } = d1();
  await db.batch(createStatements(db, table(), 1));
  const host = await load(db, 'PARTS1');
  const [ada, bo] = host.game.players;

  // Players chat and save notes while the Storyteller's action is in flight.
  assert.ok(await independent(db, 'PARTS1', ada.id, { action: 'chat', text: 'First', messageId: crypto.randomUUID() }));
  assert.ok(await independent(db, 'PARTS1', bo.id, { action: 'chat', text: 'Second', messageId: crypto.randomUUID() }));
  assert.ok(await independent(db, 'PARTS1', bo.id, { action: 'saveNotebook', started: 1, notebook: { text: 'Ada is odd', roles: {}, players: {} } }));

  host.game.day = 3;
  host.game.log.push({ id: 'core', text: 'Day 3 began.', at: 60, public: true });
  assert.ok(await save(db, host.game, host.version), 'core save must not see the chat/notebook writes as conflicts');

  const after = await load(db, 'PARTS1');
  assert.equal(after.version, host.version + 1);
  assert.equal(after.game.day, 3);
  assert.deepEqual(after.game.messages.map((m) => m.text), ['First', 'Second']);
  assert.equal(after.game.notebooks?.[bo.id]?.text, 'Ada is odd');
  assert.equal(after.game.log.at(-1)?.text, 'Day 3 began.');
});

void test('a message retried from a stale read is stored once', async () => {
  const { db } = d1();
  await db.batch(createStatements(db, table(), 1));
  const stale = await load(db, 'PARTS1');
  const actor = { id: stale.game.players[0].id, host: false };
  const command = { action: 'chat', text: 'Retry', messageId: crypto.randomUUID() } as Command;
  assert.ok(await independent(db, 'PARTS1', actor.id, command));
  const before = structuredClone(stale.game);
  execute(stale.game, actor, command, 50);
  assert.equal(await saveIndependentParts(db, stale.game, independentCommand(before, stale.game, actor, command)!), null);
  assert.equal((await load(db, 'PARTS1')).game.messages.length, 1);
});

void test('a core save that rewrites a part changed meanwhile rolls back entirely', async () => {
  const { db } = d1();
  await db.batch(createStatements(db, table(), 1));
  const host = await load(db, 'PARTS1');
  assert.ok(await independent(db, 'PARTS1', host.game.players[0].id, { action: 'chat', text: 'Player', messageId: crypto.randomUUID() }));

  // The Storyteller's stale copy also changes the chat.
  host.game.day = 9;
  host.game.messages.push({ id: crypto.randomUUID(), from: 'host', to: 'all', text: 'Storyteller', at: 70, kind: 'chat' } as Game['messages'][number]);
  assert.equal(await save(db, host.game, host.version), false);

  const after = await load(db, 'PARTS1');
  assert.equal(after.version, host.version, 'the core update rolled back with the part');
  assert.notEqual(after.game.day, 9);
  assert.deepEqual(after.game.messages.map((m) => m.text), ['Player']);

  // Retrying from a fresh read succeeds and keeps both messages.
  after.game.day = 9;
  after.game.messages.push({ id: crypto.randomUUID(), from: 'host', to: 'all', text: 'Storyteller', at: 70, kind: 'chat' } as Game['messages'][number]);
  assert.ok(await save(db, after.game, after.version));
  assert.deepEqual((await load(db, 'PARTS1')).game.messages.map((m) => m.text), ['Player', 'Storyteller']);
});

void test('two core saves from the same version: exactly one wins', async () => {
  const { db } = d1();
  await db.batch(createStatements(db, table(), 1));
  const a = await load(db, 'PARTS1');
  const b = await load(db, 'PARTS1');
  a.game.day = 2;
  b.game.day = 5;
  assert.ok(await save(db, a.game, a.version));
  assert.equal(await save(db, b.game, b.version), false);
  assert.equal((await load(db, 'PARTS1')).game.day, 2);
});

void test('deleting a table removes its parts', async () => {
  const { db, sqlite } = d1();
  await db.batch(createStatements(db, table(), 1));
  assert.ok(await independent(db, 'PARTS1', (await load(db, 'PARTS1')).game.players[0].id, { action: 'chat', text: 'Bye', messageId: crypto.randomUUID() }));
  sqlite.prepare('DELETE FROM sessions WHERE code=?').run('PARTS1');
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS n FROM session_parts').get() as { n: number }).n, 0);
});
