import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibration,
  expectedWin,
  volatility,
  ratingChanges,
  snapshotRatings,
  mvpShares,
  levelProgress,
} from '../lib/social/progression.ts';
import { canView } from '../lib/social/privacy-options.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';

void test('Elo formula, volatility and calibration boundaries', () => {
  assert.equal(expectedWin(1000, 1000), 0.5);
  assert.ok(Math.abs(expectedWin(3500, 1000) - 10 / 11) < 1e-12);
  for (const [rating, k] of [
    [-100, 750],
    [1999, 750],
    [2000, 650],
    [3999, 650],
    [4000, 550],
    [6000, 450],
    [8000, 350],
    [10000, 350],
    [100000, 350],
  ])
    assert.equal(volatility(rating), k);
  for (const [games, multiplier] of [
    [0, 1.7],
    [9, 1.7],
    [10, 1.3],
    [24, 1.3],
    [25, 1],
    [100, 1],
  ])
    assert.equal(calibration(games), multiplier);
  assert.deepEqual(ratingChanges(1000, 1000, 0), { win: 638, loss: -637 });
  assert.deepEqual(ratingChanges(1000, 1000, 10), { win: 488, loss: -487 });
  assert.deepEqual(ratingChanges(1000, 1000, 25), { win: 375, loss: -375 });
});
void test('expectations use own rating and opposing team only', () => {
  const seats = snapshotRatings(
    [
      { player: 'a', account: 'a', team: 'good', rating: 1000, rankedGames: 0 },
      {
        player: 'b',
        account: 'b',
        team: 'good',
        rating: 9000,
        rankedGames: 30,
      },
      {
        player: 'c',
        account: 'c',
        team: 'evil',
        rating: 2000,
        rankedGames: 25,
      },
      {
        player: 'd',
        account: 'd',
        team: 'evil',
        rating: 4000,
        rankedGames: 25,
      },
    ],
    true,
  );
  assert.equal(seats[0].opponentRating, 3000);
  assert.equal(seats[0].teamRating, 9000);
  assert.equal(seats[1].opponentRating, 3000);
  assert.equal(seats[2].opponentRating, 5000);
  assert.notEqual(seats[0].win, seats[1].win);
  assert.equal(snapshotRatings([seats[0]], false)[0].opponentRating, null);
  assert.equal(snapshotRatings(seats, false)[0].win, 0);
});
void test('MVP pool includes each host vote and preserves fractional shares', () => {
  const shares = mvpShares(['a', 'b', 'c', 'd'], {
    a: ['b'],
    b: ['a'],
    c: ['a'],
    host: ['a', 'b', 'c'],
  });
  assert.equal(shares.a.xp, 50);
  assert.equal(shares.a.votes, 3);
  assert.equal(shares.b.xp, 100 / 3);
  assert.ok(
    Math.abs(Object.values(shares).reduce((sum, r) => sum + r.xp, 0) - 100) <
      1e-10,
  );
  assert.equal(mvpShares(['a', 'b'], {}).a.xp, 0);
  assert.equal(
    mvpShares(['a', 'b'], {
      a: ['a'],
      stranger: ['b'],
      host: ['b', 'b', 'invalid'],
    }).b.xp,
    100,
  );
});
void test('exponential levels have exact boundaries and no arbitrary cap', () => {
  assert.equal(levelProgress(0).level, 1);
  assert.equal(levelProgress(499).level, 1);
  assert.equal(levelProgress(500).level, 2);
  assert.equal(levelProgress(500).required, 575);
  assert.equal(levelProgress(1074).level, 2);
  assert.equal(levelProgress(1075).level, 3);
  assert.ok(levelProgress(1e30).level > 400);
  assert.equal(levelProgress(-1).xp, 0);
  assert.equal(levelProgress(Number.NaN).level, 1);
});
void test('privacy allows self, honors each visibility and never bypasses blocks', () => {
  for (const visibility of ['public', 'friends', 'private'] as const) {
    assert.ok(canView(visibility, 'self'));
    assert.equal(canView(visibility, 'blocked'), false);
    assert.equal(canView(visibility, 'unavailable'), false);
  }
  assert.ok(canView('public', 'none'));
  assert.ok(canView('friends', 'friends'));
  assert.equal(canView('friends', 'none'), false);
  assert.equal(canView('private', 'friends'), false);
});
void test('ranked controls are host-only and previews never expose other seats or hidden calibration', () => {
  const g = newGame('RANKED', 'Host');
  g.players = ['washerwoman', 'librarian', 'chef', 'poisoner', 'imp'].map(
    (role, i) => ({ ...newPlayer(`Seat ${i}`, i + 1), role, shown: role }),
  );
  const host = { id: 'host', host: true },
    actor = { id: g.players[0].id, host: false };
  assert.throws(() =>
    execute(g, actor, { action: 'setRanked', ranked: true }, 1),
  );
  execute(g, host, { action: 'setRanked', ranked: true }, 1);
  g.bluffs = ['monk', 'soldier', 'mayor'];
  g.redHerring = g.players[0].id;
  execute(g, host, { action: 'start' }, 100);
  g.progression = {
    ranked: true,
    hostAccount: 'secret-host',
    seats: snapshotRatings(
      g.players.map((p, i) => ({
        player: p.id,
        account: `secret-account-${i}`,
        team: i < 3 ? 'good' : 'evil',
        rating: 1000,
        rankedGames: 0,
      })),
      true,
    ),
  };
  assert.throws(() =>
    execute(g, host, { action: 'setRanked', ranked: false }, 101),
  );
  assert.deepEqual(view(g, actor, 1, 101).ratingPreview, {
    rating: 1000,
    win: 638,
    loss: -637,
  });
  execute(g, host, { action: 'end', winner: 'good' }, 200);
  assert.ok(!JSON.stringify(view(g, actor, 1, 200)).includes('secret-account'));
  assert.ok(!JSON.stringify(view(g, actor, 1, 200)).includes('rankedGames'));
});
