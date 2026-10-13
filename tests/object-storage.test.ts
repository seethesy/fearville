import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import {
  ObjectParts,
  type TableMeta,
  type TableStorage,
} from '../lib/game/object-storage.ts';
import { SerialQueue } from '../lib/game/serial.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';

function fixture() {
  const db = new DatabaseSync(':memory:');
  const writes: string[] = [];
  const storage = {
    sql: {
      exec(query: string, ...values: (string | number)[]) {
        if (query.startsWith('INSERT INTO parts'))
          writes.push(String(values[0]));
        const result = db.prepare(query).all(...values);
        return { toArray: () => result };
      },
    },
    transactionSync<T>(fn: () => T) {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as TableStorage;
  return { db, writes, storage, parts: new ObjectParts(storage) };
}
void test('DO parts survive reload; independent saves only write changed parts, with bounded rewind chunks', () => {
  const { db, writes, storage, parts } = fixture();
  const g = newGame('123456', 'Host');
  g.players = Array.from({ length: 18 }, (_, i) =>
    newPlayer(`Player ${i}`, i + 1),
  );
  for (let i = 0; i < 2000; i++)
    g.messages.push({
      id: `m${i}`,
      from: 'host',
      to: 'all',
      text: '🦇'.repeat(1000),
      at: i,
      kind: 'chat',
    });
  g.history.push({
    id: 'decision',
    text: 'Before',
    at: 0,
    before: JSON.stringify(g),
  });
  const meta: TableMeta = {
    code: g.code,
    created: 0,
    version: 1,
    retainAt: 10000,
  };
  parts.save(g, meta);
  assert.ok(
    db
      .prepare('SELECT length(CAST(state AS BLOB)) AS bytes FROM parts')
      .all()
      .every((r) => Number(r.bytes) < 1_000_000),
  );
  const digest = (text: string) =>
    createHash('sha256').update(text).digest('hex');
  assert.equal(digest(parts.snapshot('decision')), digest(g.history[0].before));
  g.history[0].before = '';
  writes.length = 0;
  g.messages.push({
    id: 'next',
    from: 'host',
    to: 'all',
    text: 'Hi',
    at: 3000,
    kind: 'chat',
  });
  parts.save(g, { ...meta, version: 2 });
  assert.equal(writes.includes('core'), false);
  assert.ok(writes.every((key) => key.startsWith('chat:')));
  writes.length = 0;
  g.notebooks = {
    [g.players[0].id]: { roles: {}, players: {}, text: 'Private note' },
  };
  parts.save(g, { ...meta, version: 3 });
  // Creating the optional notebooks parent once adds it to the core. Further
  // notebook edits rewrite only that player's notebook.
  writes.length = 0;
  g.notebooks[g.players[0].id].text = 'New note';
  parts.save(g, { ...meta, version: 4 });
  assert.deepEqual(writes, [`notes:${g.players[0].id}`]);
  const restored = new ObjectParts(storage).load()!;
  assert.equal(restored.meta.version, 4);
  assert.equal(restored.game.messages.length, 2001);
  assert.equal(restored.game.notebooks?.[g.players[0].id].text, 'New note');
  db.close();
});
void test('a failed or awaited operation never overlaps the next one', async () => {
  const queue = new SerialQueue(),
    applied: number[] = [];
  let active = 0;
  const results = await Promise.allSettled(
    Array.from({ length: 19 }, (_, i) =>
      queue.run(async () => {
        assert.equal(++active, 1);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        applied.push(i);
        if (i === 8) throw Error('Rejected action');
        return i;
      }),
    ),
  );
  assert.deepEqual(
    applied,
    Array.from({ length: 19 }, (_, i) => i),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 18);
});
void test('empty objects stay empty after cleanup and read-only wakeups', () => {
  const { db, storage, parts } = fixture();
  assert.equal(parts.load(), null);
  assert.equal(parts.snapshot('missing'), '');
  const tables = () =>
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('parts','metadata')",
      )
      .all();
  assert.deepEqual(tables(), []);
  const g = newGame('123456', 'Host');
  parts.save(g, { code: g.code, version: 0, created: 1, retainAt: 1000 });
  db.exec('DROP TABLE parts; DROP TABLE metadata'); // deleteAll()
  assert.equal(new ObjectParts(storage).load(), null);
  assert.deepEqual(tables(), []);
  db.close();
});
