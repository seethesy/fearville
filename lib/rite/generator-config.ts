/** Authoring knobs for offline generation. Normal preserves the shipped Night Rite.
 * Dimensions are format contracts today: changing them also needs solver/art work.
 * Impossible is an extreme difficulty label; puzzles must still be solvable.
 */
export type PuzzlePreset = 'easy' | 'normal' | 'hard' | 'impossible';
export const DEFAULT_PRESET: PuzzlePreset = 'normal';
export const GENERATOR_STYLE = {
  board: {
    size: 6,
    skins: { 2: ['wood', 'crates', 'car'], 3: ['tree', 'brick', 'coach'] },
    fieldCap: 40000,
    solverCap: 100000,
    maxAttempts: 20000,
  },
  lab: {
    layers: 4,
    shapes: 7,
    solverCap: 60000,
    certificationCap: 120000,
    maxAttempts: 20000,
  },
  grid: {
    cluesPerPlayer: 4,
    minClues: 8,
    maxClues: 16,
    poolAttempts: 500,
    poolSize: 110,
    setAttempts: 40,
    fallbackAttempts: 80,
    gradedSets: 10,
    wordingAttempts: 20,
    weights: {
      direct: 0.25,
      negative: 0.8,
      eitherOr: 1,
      oneOfThree: 0.8,
      neitherNor: 0.9,
      exclusivePair: 1.1,
      setMembership: 1,
      threeWay: 0.8,
      crossCategory: 0.9,
      compound: 0.6,
      exclusiveOr: 0.8,
      conditional: 0.55,
      relational: 2,
      street: 0.6,
    },
  },
  ritual: {
    omenCount: 3,
    symbolPairs: [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ],
  },
  timing: { turnMilliseconds: 5000, lockSeconds: 30, windowSeconds: 90 },
} as const;
export const PUZZLE_PRESETS = {
  easy: {
    board: { par: [12, 16] },
    lab: { colors: 5, empty: 2, par: [10, 14] },
    grid: { soloClues: 16 },
    ritual: { omenCount: 2 },
  },
  normal: {
    board: { par: [28, 32] },
    lab: { colors: 10, empty: 2, par: [28, 32] },
    grid: { soloClues: 12 },
    ritual: { omenCount: 3 },
  },
  hard: {
    board: { par: [30, 32] },
    lab: { colors: 10, empty: 2, par: [30, 34] },
    grid: { soloClues: 10 },
    ritual: { omenCount: 4 },
  },
  impossible: {
    board: { par: [32, 36] },
    lab: { colors: 10, empty: 2, par: [34, 38] },
    grid: { soloClues: 8 },
    ritual: { omenCount: 5 },
  },
} as const;
export function puzzlePreset(value: string): PuzzlePreset {
  if (!Object.hasOwn(PUZZLE_PRESETS, value))
    throw Error('Choose easy, normal, hard or impossible.');
  return value as PuzzlePreset;
}
