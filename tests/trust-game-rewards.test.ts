import test from 'node:test';
import assert from 'node:assert/strict';
import { trustDB } from './trust-db.ts';
import {
  beginGameRewardsStatement,
  syncGameRewards,
  withdrawGameRewardsStatements,
  gameTrustEarned,
} from '../lib/trust/game-rewards.ts';
import { debit, readBalance, checkIntegrity } from '../lib/trust/wallet.ts';
function setup() {
  const { db, sqlite } = trustDB([
    '0014_trust_ledger.sql',
    '0017_trust_game_rewards.sql',
  ]);
  sqlite.exec(`INSERT INTO accounts(id) VALUES ('c'),('d'),('e'),('host'),('late');
    CREATE TABLE games(id TEXT PRIMARY KEY,host_account TEXT,winner TEXT,nights INTEGER);
    CREATE TABLE game_players(game TEXT,account TEXT,won INTEGER);
    INSERT INTO games VALUES ('g','host','good',2);
    INSERT INTO game_players VALUES ('g','a',1),('g','b',0),('g','c',0),('g','d',0),('g','e',1),('g',NULL,1);`);
  return { db, sqlite };
}
void test('game awards once, no late linking, rewind negative balance, then re-end once', async () => {
  const { db, sqlite } = setup();
  await db.batch([beginGameRewardsStatement(db, 'g', 1000)]);
  await Promise.all(
    Array.from({ length: 10 }, () => syncGameRewards(db, 'g', 1000)),
  );
  assert.equal(await readBalance(db, 'a'), 30);
  assert.equal(await readBalance(db, 'b'), 20);
  assert.equal(await readBalance(db, 'host'), 20);
  sqlite.exec("UPDATE game_players SET account='late' WHERE account IS NULL");
  await syncGameRewards(db, 'g', 1000);
  assert.equal(await readBalance(db, 'late'), 0);
  await debit(db, 'a', {
    amount: -25,
    origin: 'mixed',
    source: 'item',
    reason: 'cosmetic',
    key: 'spent',
  });
  await db.batch(withdrawGameRewardsStatements(db, 'g', 2000));
  await db.batch(withdrawGameRewardsStatements(db, 'g', 2000));
  assert.equal(await readBalance(db, 'a'), -25);
  assert.equal(await gameTrustEarned(db, 'a', 'g'), 0);
  await syncGameRewards(db, 'g', 2000);
  assert.equal(await readBalance(db, 'b'), 0);
  await db.batch([beginGameRewardsStatement(db, 'g', 3000)]);
  await db.batch([beginGameRewardsStatement(db, 'g', 3000)]);
  await syncGameRewards(db, 'g', 3000);
  await syncGameRewards(db, 'g', 3000);
  assert.equal(await readBalance(db, 'a'), 5);
  assert.equal(await readBalance(db, 'late'), 0);
  assert.equal(await gameTrustEarned(db, 'a', 'g'), 30);
  assert.deepEqual(await checkIntegrity(db), []);
});
void test('ineligible results and stale session guards do not award', async () => {
  const { db, sqlite } = setup();
  await db.batch([beginGameRewardsStatement(db, 'g', 1000)]);
  sqlite.exec('UPDATE games SET nights=1');
  await syncGameRewards(db, 'g', 1000);
  assert.equal(await readBalance(db, 'a'), 0);
  sqlite.exec('UPDATE games SET nights=2');
  await syncGameRewards(db, 'g', 1000, '0');
  assert.equal(await readBalance(db, 'a'), 0);
  await syncGameRewards(db, 'g', 1000);
  await db.batch(withdrawGameRewardsStatements(db, 'g', 2000, '0'));
  assert.equal(await readBalance(db, 'a'), 30);
});
