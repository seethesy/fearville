import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRating,
  opponentAverage,
  previewRating,
  type RatingInput,
  type RatedSeat,
} from '../lib/ranked/engine.ts';

const base: RatingInput = {
  rating: 5000,
  ratedGamesPlayed: 30,
  streak: 0,
  opponentAverage: 5000,
  result: 'win',
};
const rate = (input: Partial<RatingInput> = {}) =>
  calculateRating({ ...base, ...input });

void test('K bands include each lower and upper boundary and sub-1000 floor band', () => {
  for (const [rating, K] of [
    [500, 700],
    [999, 700],
    [1000, 700],
    [2499, 700],
    [2500, 550],
    [3999, 550],
    [4000, 450],
    [5999, 450],
    [6000, 400],
    [7999, 400],
    [8000, 350],
    [9999, 350],
    [10000, 300],
  ])
    assert.equal(rate({ rating }).breakdown.K, K);
});
void test('calibration counts the result being calculated', () => {
  for (const [game, calibration] of [
    [1, 2],
    [10, 2],
    [11, 1.5],
    [25, 1.5],
    [26, 1],
  ])
    assert.equal(
      rate({ ratedGamesPlayed: game - 1 }).breakdown.calibration,
      calibration,
    );
});
void test('matching streak includes this result, resets opposite streak and caps at five', () => {
  for (const [streak, multiplier] of [
    [0, 1],
    [1, 1.1],
    [2, 1.2],
    [3, 1.35],
    [4, 1.5],
    [5, 1.5],
    [100, 1.5],
  ]) {
    assert.equal(rate({ streak }).breakdown.streakMultiplier, multiplier);
    assert.equal(
      rate({ streak: -streak, result: 'loss' }).breakdown.streakMultiplier,
      multiplier,
    );
  }
  assert.equal(rate({ streak: -4 }).nextStreak, 1);
  assert.equal(rate({ streak: 4, result: 'loss' }).nextStreak, -1);
  assert.equal(rate({ streak: -4 }).gain, rate().gain);
  assert.equal(
    rate({ streak: 4, result: 'loss' }).loss,
    rate({ result: 'loss' }).loss,
  );
});
void test('progression boundaries and loss reduction', () => {
  for (const [rating, bonus] of [
    [500, 175],
    [999, 175],
    [1000, 175],
    [1999, 175],
    [2000, 125],
    [2999, 125],
    [3000, 75],
    [3999, 75],
    [4000, 35],
    [4999, 35],
    [5000, 0],
  ])
    assert.equal(rate({ rating }).breakdown.progressionBonus, bonus);
  assert.equal(
    rate({ rating: 2999, result: 'loss' }).breakdown.lossReduction,
    0.75,
  );
  assert.equal(
    rate({ rating: 3000, result: 'loss' }).breakdown.lossReduction,
    1,
  );
});
void test('floor includes departure penalty; leave forces loss without changing streak', () => {
  const left = rate({ rating: 500, result: 'win', departed: true, streak: 4 });
  assert.equal(left.newRating, 500);
  assert.equal(left.delta, 0);
  assert.equal(left.nextStreak, 4);
  assert.equal(left.breakdown.leavePenalty, 100);
  const loss = rate({ result: 'loss' });
  const departure = rate({ departed: true });
  assert.equal(departure.delta, loss.delta - 100);
});
void test('rounds once per stake and records deterministic audit data', () => {
  const result = rate({ rating: 4000, opponentAverage: 4000 });
  assert.equal(result.gain, 260);
  assert.equal(result.loss, 225);
  assert.equal(
    rate({ rating: 4000, opponentAverage: 4000, streak: 1 }).gain,
    283,
  );
  assert.deepEqual(rate(), rate());
  assert.equal(rate({ antiFarmingFactor: 0 }).gain, 0);
  assert.equal(
    rate({ antiFarmingFactor: 0, result: 'loss' }).loss,
    rate({ result: 'loss' }).loss,
  );
});
void test('team, Traveler and lobby averages exclude self and Storyteller', () => {
  const table: RatedSeat[] = [
    { id: 'g', rating: 1000, team: 'good' },
    { id: 'e', rating: 3000, team: 'evil' },
    { id: 't', rating: 2000, team: 'traveler' },
    { id: 'h', rating: 10000, team: 'storyteller' },
  ];
  assert.equal(opponentAverage(table[0], table), 3000);
  assert.equal(opponentAverage(table[1], table), 1000);
  assert.equal(opponentAverage(table[2], table), 2000);
  assert.equal(
    previewRating(
      { rating: 1000, ratedGamesPlayed: 0, streak: 0 },
      table[0],
      table,
    ).opponentAverage,
    2500,
  );
  assert.equal(opponentAverage(table[0], []), 1000);
  assert.equal(
    previewRating(
      { rating: 1000, ratedGamesPlayed: 0, streak: 0 },
      table[0],
      table,
    ).gain,
    previewRating(
      { rating: 1000, ratedGamesPlayed: 0, streak: 0 },
      { ...table[0], team: 'evil' },
      table,
    ).gain,
  );
});
void test('rejects invalid numeric inputs without mutating callers', () => {
  const input = Object.freeze({ ...base });
  calculateRating(input);
  for (const patch of [
    { rating: NaN },
    { ratedGamesPlayed: -1 },
    { streak: 1.5 },
    { antiFarmingFactor: 2 },
    { opponentAverage: Infinity },
  ])
    assert.throws(() => rate(patch), RangeError);
});
