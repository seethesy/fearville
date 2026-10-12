// Export a consistent full Wrangler snapshot, then keep durable records only.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  argumentsFor,
  extractDump,
  tables,
  optionalTables,
  wrangler,
} from './d1-transfer.mjs';
import { Miniflare } from 'miniflare';
import { readConfig } from './wrangler-config.mjs';
const options = argumentsFor(process.argv.slice(2), true);
const temp = mkdtempSync(path.join(tmpdir(), 'fearville-export-'));
try {
  const file = path.join(temp, 'snapshot.sql');
  let dump;
  if (options['source-sql']) {
    dump = extractDump(readFileSync(options['source-sql'], 'utf8'));
  } else if (options.mode === 'local') {
    const config = readConfig(options.config || 'wrangler.jsonc');
    const bindings = (options.env ? config.env[options.env] : config)
      .d1_databases;
    const binding = bindings.find(
      (db) =>
        db.binding === options.database ||
        db.database_name === options.database,
    );
    if (!binding) throw new Error('Database not found in local configuration.');
    const mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response(); } };',
      d1Databases: { DB: binding.database_id },
      d1Persist: path.join(options['persist-to'] || '.wrangler/state', 'v3/d1'),
    });
    try {
      const db = await mf.getD1Database('DB');
      const schema = (
        await db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
      ).results;
      const selected = tables.filter(
        (table) =>
          !optionalTables.includes(table) ||
          schema.some((row) => row.name === table),
      );
      const rows = await db.batch(
        selected.map((table) => db.prepare(`SELECT * FROM "${table}"`)),
      );
      dump = {
        format: 'fearville-d1-v1',
        tables: Object.fromEntries(
          tables.map((table) => [
            table,
            selected.includes(table)
              ? rows[selected.indexOf(table)].results
              : [],
          ]),
        ),
      };
    } finally {
      await mf.dispose();
    }
  } else {
    wrangler(options, ['export', '--output', file]);
    dump = extractDump(readFileSync(file, 'utf8'));
  }
  writeFileSync(options.file, JSON.stringify(dump), {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(
    'Exported durable records; excluded live sessions and login credentials.',
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
