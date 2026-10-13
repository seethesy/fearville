import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { seedStatements } from '../lib/staging/seed.ts';
import { stagingDatabase } from '../scripts/staging-database.mjs';
void test('staging seed is idempotent and never creates authentication credentials', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    db.exec(seedStatements(1000000).join('\n'));
    db.exec(seedStatements(2000000).join('\n'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts').get()?.n, 6);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games').get()?.n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM friendships').get()?.n, 5);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_players').get()?.n, 15);
    for (const table of ['identities', 'account_sessions', 'native_codes', 'members']) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n, 0);
  } finally { db.close(); }
});
void test('staging tooling refuses a production database binding', () => {
  assert.throws(() => stagingDatabase({ env: { staging: { vars: { ENVIRONMENT: 'staging', APP_ORIGIN: 'https://staging.fearville.app' }, d1_databases: [{ binding: 'DB', database_id: 'same' }] }, production: { d1_databases: [{ binding: 'DB', database_id: 'same' }] } } }));
});
