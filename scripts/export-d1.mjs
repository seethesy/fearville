// Export a consistent full Wrangler snapshot, then keep durable records only.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argumentsFor, extractDump, tables, wrangler } from './d1-transfer.mjs';
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
      const rows = await db.batch(
        tables.map((table) => db.prepare(`SELECT * FROM "${table}"`)),
      );
      dump = {
        format: 'fearville-d1-v1',
        tables: Object.fromEntries(
          tables.map((table, i) => [table, rows[i].results]),
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
