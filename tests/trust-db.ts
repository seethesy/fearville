import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function trustDB(migrations = ['0014_trust_ledger.sql']) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE accounts(id TEXT PRIMARY KEY,role TEXT DEFAULT 'player'); INSERT INTO accounts(id) VALUES ('a'),('b');",
  );
  for (const name of migrations)
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'),
    );
  function prepare(sql: string) {
    let values: (string | number | null)[] = [];
    return {
      bind(...args: (string | number | null)[]) {
        values = args;
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...values) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...values) };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    };
  }
  const db = {
    prepare,
    async batch(statements: { run: () => Promise<unknown> }[]) {
      // Queue concurrent batches just as D1 serializes SQLite transactions.
      const results = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  let queue = Promise.resolve();
  const batch = db.batch.bind(db);
  db.batch = (statements) => {
    const next = queue.then(() => batch(statements));
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  return { db: db as unknown as D1Database, sqlite };
}
