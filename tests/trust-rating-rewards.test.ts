import test from 'node:test';
import assert from 'node:assert/strict';
import { trustDB } from './trust-db.ts';
import { ratingRewardStatements } from '../lib/trust/rating-rewards.ts';
import {
  beginGameRewardsStatement,
  withdrawGameRewardsStatements,
} from '../lib/trust/game-rewards.ts';
import {
  readBalance,
  credit,
  debit,
  checkIntegrity,
} from '../lib/trust/wallet.ts';
function setup() {
  const { db, sqlite } = trustDB([
    '0014_trust_ledger.sql',
    '0015_cosmetics_catalog.sql',
    '0017_trust_game_rewards.sql',
    '0018_trust_rating_rewards.sql',
  ]);
  sqlite.exec(`INSERT INTO accounts(id) VALUES ('c'),('d'),('e'),('host');
    CREATE TABLE games(id TEXT PRIMARY KEY,host_account TEXT,winner TEXT,nights INTEGER);
    CREATE TABLE game_players(game TEXT,account TEXT,won INTEGER);
    CREATE TABLE storyteller_ratings(game TEXT,rater TEXT,storyteller TEXT,stars INTEGER,PRIMARY KEY(game,rater));
    INSERT INTO games VALUES ('g','host','good',2);
    INSERT INTO game_players VALUES ('g','a',1),('g','b',0),('g','c',0),('g','d',0),('g','e',1);`);
  const rate = async (rater: string, stars: number) =>
    db.batch([
      db
        .prepare(
          "INSERT INTO storyteller_ratings VALUES ('g',?,'host',?) ON CONFLICT(game,rater) DO UPDATE SET stars=excluded.stars",
        )
        .bind(rater, stars),
      ...ratingRewardStatements(db, 'g', 'host', 1000),
    ]);
  return { db, sqlite, rate };
}
void test('minimum distinct raters, capped deltas, retries, negatives and anonymous ledger', async () => {
  const { db, sqlite, rate } = setup();
  await db.batch([beginGameRewardsStatement(db, 'g', 1000)]);
  await rate('a', 5);
  await rate('b', 4);
  assert.equal(await readBalance(db, 'host'), 0);
  await rate('c', 3);
  assert.equal(await readBalance(db, 'host'), 15);
  await rate('a', 2);
  assert.equal(await readBalance(db, 'host'), 5);
  await rate('a', 2);
  assert.equal(await readBalance(db, 'host'), 5);
  await Promise.all([rate('a', 5), rate('d', 5)]);
  assert.equal(await readBalance(db, 'host'), 15);
  await debit(db, 'host', {
    amount: -15,
    origin: 'mixed',
    reason: 'cosmetic',
    source: 'test',
    key: 'spend',
  });
  await rate('a', 2);
  await rate('b', 2);
  await rate('d', 2);
  assert.equal(await readBalance(db, 'host'), -15);
  const rows = sqlite
    .prepare("SELECT * FROM trust_ledger WHERE reason='rating'")
    .all();
  for (const row of rows) {
    assert.equal(row.source, 'g');
    assert.match(String(row.idempotency_key), /^rating:g:\d+$/);
    assert.equal(row.reason, 'rating');
  }
  assert.deepEqual(await checkIntegrity(db), []);
});
void test('self and flagged links excluded, daily cap shared, withdrawal and re-end', async () => {
  const { db, sqlite, rate } = setup();
  await db.batch([beginGameRewardsStatement(db, 'g', 1000)]);
  sqlite.exec("INSERT INTO trust_account_links VALUES ('a','host')");
  await rate('host', 5);
  await rate('a', 5);
  await rate('b', 5);
  await rate('c', 5);
  assert.equal(await readBalance(db, 'host'), 0);
  await credit(db, 'host', {
    amount: 195,
    origin: 'earned',
    source: 'other',
    reason: 'finish',
    key: 'budget',
    now: 1000,
  });
  await rate('d', 5);
  assert.equal(await readBalance(db, 'host'), 200);
  await rate('d', 5);
  assert.equal(await readBalance(db, 'host'), 200);
  await db.batch(withdrawGameRewardsStatements(db, 'g', 1000));
  assert.equal(await readBalance(db, 'host'), 195);
  await rate('d', 5);
  assert.equal(await readBalance(db, 'host'), 195);
  await db.batch([beginGameRewardsStatement(db, 'g', 1000)]);
  await rate('d', 5);
  assert.equal(await readBalance(db, 'host'), 200);
});
