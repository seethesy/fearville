import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { deleteAccountData } from '../lib/accounts/deletion.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';
import {
  createStatements,
  SESSION_COLUMNS,
  loadStored,
  type SessionRow,
} from '../lib/game/part-store.ts';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const sql of readFileSync(`drizzle/${file}`, 'utf8').split(
      '--> statement-breakpoint',
    ))
      if (sql.trim()) sqlite.exec(sql);
  type Value = string | number | null;
  const statement = (sql: string, params: Value[] = []) => ({
    sql,
    params,
    bind: (...values: unknown[]) => statement(sql, values as Value[]),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  });
  let beforeBatch: (() => void) | undefined;
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      const hook = beforeBatch;
      beforeBatch = undefined;
      hook?.();
      sqlite.exec('BEGIN');
      try {
        const results = list.map((s) => ({
          meta: {
            changes: Number(sqlite.prepare(s.sql).run(...s.params).changes),
          },
        }));
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;
  const game = newGame('DELETE', 'Other host');
  const player = newPlayer('Xavier Quill', 1);
  player.id = 'px';
  player.avatar = 'data:image/png;base64,PRIVATE';
  game.players = [player, newPlayer('Zoe', 2)];
  game.notebooks = { px: { text: 'private notebook', roles: {}, players: {} } };
  game.messages = [
    {
      id: 'm',
      from: 'px',
      to: 'all',
      text: 'private chat',
      at: 1,
      kind: 'chat',
    },
  ];
  game.history = [
    {
      id: 'h',
      at: 1,
      text: 'Xavier Quill joined',
      before: JSON.stringify(game),
    },
  ];
  sqlite.exec(
    "INSERT INTO accounts(id,name,email,created) VALUES ('deleted','Xavier Quill','x@example.invalid',0)",
  );
  const seed = async () => {
    await db.batch(createStatements(db, game, 1));
    sqlite.exec(
      "INSERT INTO account_seats(id,account,code,player,host) VALUES ('seat','deleted','DELETE','px',0)",
    );
    sqlite
      .prepare('INSERT INTO session_snapshots(code,id,state) VALUES (?,?,?)')
      .run(game.code, 'h', JSON.stringify(game));
  };
  return {
    sqlite,
    db,
    game,
    seed,
    race: (hook: () => void) => {
      beforeBatch = hook;
    },
  };
}

void test('account deletion anonymises split parts and rewind snapshots', async () => {
  const f = fixture();
  try {
    await f.seed();
    await deleteAccountData(f.db, 'deleted');
    const row = f.sqlite
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE code='DELETE'`)
      .get() as SessionRow;
    const { game } = loadStored(row);
    assert.equal(game.players[0].name, 'Former player');
    assert.equal(game.messages.length, 0);
    assert.equal(game.notebooks?.px, undefined);
    assert.equal(
      f.sqlite.prepare("SELECT id FROM accounts WHERE id='deleted'").get(),
      undefined,
    );
    for (const table of ['sessions', 'session_parts', 'session_snapshots']) {
      const dump = JSON.stringify(
        f.sqlite.prepare(`SELECT * FROM ${table}`).all(),
      );
      for (const privateText of [
        'Xavier Quill',
        'private notebook',
        'private chat',
        'base64,PRIVATE',
      ])
        assert.ok(
          !dump.includes(privateText),
          `${table} contains ${privateText}`,
        );
    }
  } finally {
    f.sqlite.close();
  }
});

void test('account deletion retries a concurrent core save before removing the account', async () => {
  const f = fixture();
  try {
    await f.seed();
    f.race(() =>
      f.sqlite.exec(
        "UPDATE sessions SET version=version+1, state=json_set(state,'$.hostName','Concurrent host') WHERE code='DELETE'",
      ),
    );
    await deleteAccountData(f.db, 'deleted');
    const row = f.sqlite
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE code='DELETE'`)
      .get() as SessionRow;
    assert.equal(loadStored(row).game.hostName, 'Concurrent host');
    assert.equal(loadStored(row).game.players[0].name, 'Former player');
  } finally {
    f.sqlite.close();
  }
});

void test('account deletion retries a concurrent chat save and removes the new private message', async () => {
  const f = fixture();
  try {
    await f.seed();
    f.race(() =>
      f.sqlite.exec(
        'UPDATE session_parts SET state=json_insert(state,\'$[#]\',json(\'{"id":"new","from":"px","to":"all","text":"concurrent private chat","at":2,"kind":"chat"}\')), rev=rev+1 WHERE code=\'DELETE\' AND part=\'chat:00000\'',
      ),
    );
    await deleteAccountData(f.db, 'deleted');
    const dump = JSON.stringify(
      f.sqlite.prepare('SELECT * FROM session_parts').all(),
    );
    assert.ok(!dump.includes('private chat'));
  } finally {
    f.sqlite.close();
  }
});

void test('account deletion anonymises report snapshots and reporter seat links', async () => {
  const f = fixture();
  try {
    await f.seed();
    f.sqlite.exec("INSERT INTO player_reports(id,kind,reason,target_account,target_name,content,note,resolution,created) VALUES ('target','chat','other','deleted','Xavier Quill','private chat','private notebook','Xavier Quill warned',1)");
    f.sqlite.exec("INSERT INTO player_reports(id,kind,reason,reporter_account,reporter_seat,note,created) VALUES ('reporter','player','other','deleted','DELETE:px','private notebook',1)");
    f.sqlite.exec("INSERT INTO player_reports(id,kind,reason,reporter_seat,note,created) VALUES ('guest','chat','other','DELETE:px','private notebook',1)");
    await deleteAccountData(f.db, 'deleted');
    const reports = f.sqlite.prepare('SELECT * FROM player_reports').all();
    assert.equal(reports.length, 3, 'anonymous report metadata survives');
    for (const privateText of ['Xavier Quill', 'private chat', 'private notebook', 'DELETE:px', 'deleted'])
      assert.ok(!JSON.stringify(reports).includes(privateText));
  } finally { f.sqlite.close(); }
});
