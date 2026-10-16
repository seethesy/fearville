import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAwards,
  awardStatement,
  type AwardResult,
} from '../lib/trust/awards.ts';
import {
  createWalletStatement,
  checkIntegrity,
  readBalance,
} from '../lib/trust/wallet.ts';
import { trustDB } from './trust-db.ts';
const result: AwardResult = {
  id: 'game',
  cycle: 1,
  ended: true,
  winner: 'evil',
  nights: 2,
  host: 'host',
  players: Array.from({ length: 5 }, (_, i) => ({
    account: 'p' + i,
    won: i === 0,
  })),
};
void test('eligibility, guests, all winning teams, unique accounts and host finish', () => {
  assert.equal(
    computeAwards(result).reduce((s, a) => s + a.amount, 0),
    130,
  );
  for (const change of [
    { ended: false },
    { sandbox: true },
    { winner: null },
    { nights: 1 },
    { players: result.players.slice(0, 4) },
    { players: result.players.map(() => ({ account: 'p0', won: true })) },
  ])
    assert.deepEqual(computeAwards({ ...result, ...change }), []);
  for (const winner of ['good', 'evil', 'neutral']) {
    const awards = computeAwards({
      ...result,
      winner,
      players: [...result.players, { account: null, won: true }],
    });
    assert.equal(awards.filter((a) => a.reason === 'win').length, 1);
    assert.equal(awards.find((a) => a.account === 'host')?.amount, 20);
    assert.deepEqual(computeAwards({ ...result, winner }), awards);
  }
  assert.deepEqual(
    computeAwards({ ...result, daily: { p0: 195 } })
      .filter((a) => a.account === 'p0')
      .map((a) => a.amount),
    [5],
  );
  assert.equal(
    computeAwards({ ...result, game: { p0: 45 } }).filter(
      (a) => a.account === 'p0',
    ).length,
    0,
  );
});
void test('simultaneous award inserts cannot exceed daily or game caps', async () => {
  const { db } = trustDB();
  await db.batch([createWalletStatement(db, 'a')]);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      db.batch([
        awardStatement(
          db,
          { account: 'a', amount: 30, reason: 'finish', key: 'award' + i },
          'game' + Math.floor(i / 2),
          1000,
        ),
      ]),
    ),
  );
  assert.equal(await readBalance(db, 'a'), 200);
  const games = (
    await db
      .prepare(
        'SELECT source,SUM(amount) amount FROM trust_ledger GROUP BY source',
      )
      .all<{ amount: number }>()
  ).results;
  assert.ok(games.every((g) => g.amount <= 45));
  assert.deepEqual(await checkIntegrity(db), []);
});
