/** Initial FEAR-125 constants. Simulation may tune these without changing the engine. */
export const RATING_CONFIG = {
  startingRating: 1000,
  floor: 500,
  expectedScoreDivisor: 2500,
  kBands: [
    { below: 2500, value: 700 },
    { below: 4000, value: 550 },
    { below: 6000, value: 450 },
    { below: 8000, value: 400 },
    { below: 10000, value: 350 },
    { below: Infinity, value: 300 },
  ],
  calibration: [
    { through: 10, value: 2 },
    { through: 25, value: 1.5 },
    { through: Infinity, value: 1 },
  ],
  streak: [1, 1, 1.1, 1.2, 1.35, 1.5],
  progression: [
    { below: 2000, value: 175 },
    { below: 3000, value: 125 },
    { below: 4000, value: 75 },
    { below: 5000, value: 35 },
    { below: Infinity, value: 0 },
  ],
  lossReductionBelow: 3000,
  lossReduction: 0.75,
  leavePenalty: 100,
  antiFarmingFactor: 1,
} as const;
