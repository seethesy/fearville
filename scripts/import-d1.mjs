import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  argumentsFor,
  importSql,
  readDump,
  tables,
  wrangler,
} from './d1-transfer.mjs';
const options = argumentsFor(process.argv.slice(2));
// Refuse merges or overwrites: this is a one-time transfer to a migrated target.
const counts = JSON.parse(
  wrangler(options, [
    'execute',
    '--json',
    '--command',
    tables.map((t) => `SELECT COUNT(*) AS n FROM "${t}";`).join('\n'),
  ]),
);
if (counts.some((result) => result.results.some((row) => row.n !== 0)))
  throw new Error('Target durable tables must be empty.');
const sql = importSql(readDump(options.file));
const temp = mkdtempSync(path.join(tmpdir(), 'fearville-import-'));
try {
  const file = path.join(temp, 'import.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  wrangler(options, ['execute', '--file', file]);
  console.log('Imported durable records. Players must sign in again.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
