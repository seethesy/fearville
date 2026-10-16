import test from 'node:test';
import assert from 'node:assert/strict';
import { trustDB } from './trust-db.ts';
import { walletHistory } from '../lib/trust/history.ts';
import { credit, debit } from '../lib/trust/wallet.ts';
void test('wallet pagination and filters match immutable ledger without private bookkeeping', async () => {
  const { db } = trustDB([
    '0014_trust_ledger.sql',
    '0015_cosmetics_catalog.sql',
  ]);
  const m = {
    amount: 1,
    origin: 'earned' as const,
    source: 'game',
    reason: 'finish',
    key: '0',
  };
  for (let i = 0; i < 55; i++) await credit(db, 'a', { ...m, key: String(i) });
  const first = await walletHistory(db, 'a', new URLSearchParams());
  const second = await walletHistory(
    db,
    'a',
    new URLSearchParams({ cursor: first.cursor! }),
  );
  assert.equal(first.balance, 55);
  assert.equal(first.entries.length, 50);
  assert.equal(second.entries.length, 5);
  assert.equal(second.cursor, null);
  assert.equal(
    new Set([...first.entries, ...second.entries].map((e) => e.id)).size,
    55,
  );
  assert.equal(first.entries[0].balance_after, 55);
  await debit(db, 'a', { ...m, amount: -2, key: 'spent', origin: 'mixed' });
  assert.equal(
    (await walletHistory(db, 'a', new URLSearchParams({ filter: 'spent' })))
      .entries.length,
    1,
  );
  assert.equal(
    (await walletHistory(db, 'a', new URLSearchParams({ filter: 'earned' })))
      .entries.length,
    50,
  );
  const publicView = JSON.stringify(
    await walletHistory(db, 'a', new URLSearchParams()),
  );
  assert.ok(
    !publicView.includes('idempotency') &&
      !publicView.includes('wallet"') &&
      !publicView.includes('source'),
  );
  await assert.rejects(
    walletHistory(db, null, new URLSearchParams()),
    /not_signed_in/,
  );
  await assert.rejects(
    walletHistory(db, 'a', new URLSearchParams({ cursor: 'bad' })),
    /Invalid/,
  );
});
