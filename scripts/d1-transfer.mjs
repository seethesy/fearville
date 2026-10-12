import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Durable account/history records only. Session-bound and authentication state
// must not survive a hosting move. Identity refresh tokens remain encrypted.
export const tables = [
  'accounts',
  'identities',
  'account_profiles',
  'account_settings',
  'friendships',
  'games',
  'game_players',
  'storyteller_ratings',
  'tutorial_progress',
  'player_reports',
];
// Older Sites snapshots predate reporting. Missing optional tables are empty;
// every core account/history table is still required.
export const optionalTables = ['player_reports'];
export function argumentsFor(argv, allowSqlSource = false) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || !argv[i + 1])
      throw new Error('Expected --option value pairs.');
    options[argv[i].slice(2)] = argv[i + 1];
  }
  if (allowSqlSource && options['source-sql'] && options.file) return options;
  if (
    !options.database ||
    !options.file ||
    !['local', 'remote'].includes(options.mode)
  )
    throw new Error(
      'Required: --database NAME --file PATH --mode local|remote [--config PATH] [--env staging|production] [--persist-to PATH]',
    );
  return options;
}
export function wrangler(options, args) {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      ...args,
      options.database,
      `--${options.mode}`,
      '--config',
      options.config || 'wrangler.jsonc',
      ...(options.env ? ['--env', options.env] : []),
      ...(options['persist-to'] ? ['--persist-to', options['persist-to']] : []),
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // SQL and row values may contain private data; never echo Wrangler output.
  if (result.status !== 0)
    throw new Error(
      'D1 transfer command failed. Check database, permissions, schema and file locally.',
    );
  return result.stdout;
}
export function extractDump(sql) {
  const db = new DatabaseSync(':memory:', {
    enableForeignKeyConstraints: false,
  });
  try {
    db.exec(sql);
    const data = Object.fromEntries(
      tables.map((table) => {
        if (
          optionalTables.includes(table) &&
          !db
            .prepare(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            )
            .get(table)
        )
          return [table, []];
        const rows = db.prepare(`SELECT * FROM "${table}"`).all();
        return [table, rows];
      }),
    );
    return { format: 'fearville-d1-v1', tables: data };
  } finally {
    db.close();
  }
}
function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error('Unsupported D1 value.');
}
export function importSql(dump) {
  if (
    dump.format !== 'fearville-d1-v1' ||
    !dump.tables ||
    Object.keys(dump.tables).some((table) => !tables.includes(table)) ||
    tables.some(
      (table) => !optionalTables.includes(table) && !(table in dump.tables),
    )
  )
    throw new Error('Invalid transfer format or table set.');
  const sql = [
    '-- Apply migrations first. Import once into an empty database.',
  ];
  for (const table of tables) {
    const rows =
      table in dump.tables
        ? dump.tables[table]
        : optionalTables.includes(table)
          ? []
          : undefined;
    if (!Array.isArray(rows)) throw new Error('Invalid rows.');
    for (const row of rows) {
      const columns = Object.keys(row);
      if (!columns.length || columns.some((key) => !/^[a-z_]+$/.test(key)))
        throw new Error('Invalid column names.');
      sql.push(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(',')}) VALUES (${columns.map((c) => literal(row[c])).join(',')});`,
      );
    }
  }
  return sql.join('\n') + '\n';
}
export function readDump(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
