import test from 'node:test';
import assert from 'node:assert/strict';
import { trustDB } from './trust-db.ts';
import { purchase } from '../lib/trust/shop.ts';
import {
  credit,
  readBalance,
  checkIntegrity,
  mutateWallet,
} from '../lib/trust/wallet.ts';
function setup() {
  const result = trustDB([
    '0014_trust_ledger.sql',
    '0015_cosmetics_catalog.sql',
    '0016_trust_shop.sql',
  ]);
  result.sqlite.exec(
    "INSERT INTO cosmetics(id,category,name,price,preview,created,updated) VALUES ('test','profile_flair','Test',10,'test',0,0),('other','profile_flair','Other',10,'other',0,0)",
  );
  return result;
}
const funds = {
  amount: 20,
  origin: 'earned' as const,
  source: 'game',
  reason: 'finish',
  key: 'funds',
};
void test('racing same-item purchases charge once; retry returns original despite withdrawal', async () => {
  const { db, sqlite } = setup();
  await credit(db, 'a', funds);
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) =>
      purchase(db, 'a', 'test', 'purchase' + i, 1000),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await readBalance(db, 'a'), 10);
  sqlite.exec("UPDATE cosmetics SET available=0 WHERE id='test'");
  assert.equal((await purchase(db, 'a', 'test', 'purchase0', 2000)).price, 10);
  await assert.rejects(
    purchase(db, 'a', 'other', 'purchase0'),
    /idempotency_conflict/,
  );
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) n FROM owned_cosmetics').get()?.n,
    1,
  );
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) n FROM trust_purchases').get()?.n,
    1,
  );
  assert.deepEqual(await checkIntegrity(db), []);
});
void test('insufficient funds, guest, ended sales, negative balances and rollback', async () => {
  const { db, sqlite } = setup();
  await assert.rejects(purchase(db, null, 'test', 'guest'), /not_signed_in/);
  await assert.rejects(purchase(db, 'a', 'test', 'poor'), /insufficient_trust/);
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) n FROM trust_purchases').get()?.n,
    0,
  );
  await credit(db, 'a', funds);
  sqlite.exec("UPDATE cosmetics SET ends=100 WHERE id='test'");
  await assert.rejects(
    purchase(db, 'a', 'test', 'expired', 100),
    /unavailable/,
  );
  assert.equal(await readBalance(db, 'a'), 20);
  sqlite.exec(
    "CREATE TRIGGER fail_ownership BEFORE INSERT ON owned_cosmetics BEGIN SELECT RAISE(ABORT,'forced'); END",
  );
  await assert.rejects(purchase(db, 'a', 'other', 'rollback'), /forced/);
  assert.equal(await readBalance(db, 'a'), 20);
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) n FROM trust_purchases').get()?.n,
    0,
  );
  await mutateWallet(db, 'a', {
    ...funds,
    amount: -30,
    kind: 'reversal',
    key: 'reverse',
  });
  await assert.rejects(
    purchase(db, 'a', 'other', 'negative'),
    /insufficient_trust/,
  );
});
