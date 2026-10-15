import { RATING_CONFIG as config } from './config.ts';

export type RatingInput = {
  rating: number;
  /** Number completed before this result (the first result has zero). */
  ratedGamesPlayed: number;
  /** Signed streak before this result. */
  streak: number;
  opponentAverage: number;
  result: 'win' | 'loss';
  departed?: boolean;
  /** Diminishes gains, including progression; never reduces losses or leave penalties. */
  antiFarmingFactor?: number;
};

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new RangeError(name + ' must be finite.');
}

export function calculateRating(input: RatingInput) {
  for (const key of ['rating', 'ratedGamesPlayed', 'streak', 'opponentAverage'] as const)
    finite(input[key], key);
  if (input.rating < config.floor || input.opponentAverage < config.floor)
    throw new RangeError('Ratings must be at least the floor.');
  if (!Number.isInteger(input.ratedGamesPlayed) || input.ratedGamesPlayed < 0 ||
      !Number.isInteger(input.streak))
    throw new RangeError('Games and streak must be integers; games cannot be negative.');
  const antiFarmingFactor = input.antiFarmingFactor ?? config.antiFarmingFactor;
  finite(antiFarmingFactor, 'antiFarmingFactor');
  if (antiFarmingFactor < 0 || antiFarmingFactor > 1)
    throw new RangeError('antiFarmingFactor must be between zero and one.');
  const result = input.departed ? 'loss' : input.result;
  const nextStreak = input.departed ? input.streak :
    result === 'win' ? Math.max(0, input.streak) + 1 : Math.min(0, input.streak) - 1;
  const E = 1 / (1 + 10 ** ((input.opponentAverage - input.rating) / config.expectedScoreDivisor));
  const K = config.kBands.find(b => input.rating < b.below)!.value;
  const calibration = config.calibration.find(b => input.ratedGamesPlayed + 1 <= b.through)!.value;
  const multiplier = (n: number) => config.streak[Math.min(n, config.streak.length - 1)];
  // Each hypothetical stake includes the next result; departing leaves the streak untouched.
  const winStreak = multiplier(input.departed ? Math.max(0, input.streak) : Math.max(0, input.streak) + 1);
  const lossStreak = multiplier(input.departed ? Math.max(0, -input.streak) : Math.max(0, -input.streak) + 1);
  const progressionBonus = config.progression.find(b => input.rating < b.below)!.value;
  const lossReduction = input.rating < config.lossReductionBelow ? config.lossReduction : 1;
  const gain = Math.round((K * (1 - E) * calibration * winStreak + progressionBonus) * antiFarmingFactor);
  const loss = Math.round(K * E * calibration * lossStreak * lossReduction);
  const leavePenalty = input.departed ? config.leavePenalty : 0;
  const rawDelta = result === 'win' ? gain : -loss - leavePenalty;
  const newRating = Math.max(config.floor, input.rating + rawDelta);
  return {
    gain, loss, delta: newRating - input.rating, newRating, nextStreak,
    breakdown: {
      E, K, calibration, streakMultiplier: result === 'win' ? winStreak : lossStreak,
      progressionBonus: result === 'win' ? progressionBonus : 0,
      lossReduction: result === 'loss' ? lossReduction : 1,
      floor: config.floor, floorAdjustment: newRating - input.rating - rawDelta,
      antiFarmingFactor: result === 'win' ? antiFarmingFactor : 1, leavePenalty,
    },
  };
}

export type RatedSeat = { id: string; rating: number; team: 'good' | 'evil' | 'traveler' | 'storyteller' };

/** No opponents (e.g. an incomplete lobby) uses the starting rating. */
export function opponentAverage(seat: RatedSeat, table: readonly RatedSeat[], preview = false) {
  const opponents = table.filter(other => other.id !== seat.id && other.team !== 'storyteller' &&
    (preview || seat.team === 'traveler' ||
      (seat.team === 'good' && other.team === 'evil') ||
      (seat.team === 'evil' && other.team === 'good')));
  for (const other of opponents) {
    finite(other.rating, 'opponent rating');
    if (other.rating < config.floor) throw new RangeError('Opponent rating is below the floor.');
  }
  return opponents.length ? opponents.reduce((sum, other) => sum + other.rating, 0) / opponents.length : config.startingRating;
}

/** Alignment-neutral stakes. Call only with public lobby ratings, never undealt roles. */
export function previewRating(input: Omit<RatingInput, 'opponentAverage' | 'result' | 'departed'>, seat: RatedSeat, table: readonly RatedSeat[]) {
  const average = opponentAverage(seat, table, true);
  const win = calculateRating({ ...input, opponentAverage: average, result: 'win' });
  const loss = calculateRating({ ...input, opponentAverage: average, result: 'loss' });
  return { gain: win.delta, loss: -loss.delta, opponentAverage: average };
}
