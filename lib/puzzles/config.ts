export const puzzleNames = {
  tiles: 'Tile Memory',
  words: 'Seen / New Words',
  odd: 'Odd One Out',
  rhythm: 'Rhythm Sequence',
  sorting: 'Category Sorting',
  pattern: 'Pattern Completion',
} as const;
export type PuzzleKind = keyof typeof puzzleNames;
export const maxLevels: Record<PuzzleKind, number> = {
  tiles: 20,
  words: 1,
  odd: 20,
  rhythm: 20,
  sorting: 10,
  pattern: 10,
};
export const settings = {
  mistakes: 3,
  generationAttempts: 20,
  wordRounds: 20,
  wordNewRatio: 0.65,
  maxWordStreak: 3,
  allowImmediateRepeat: false,
  rhythmMaxRun: 2,
  rhythmFailImmediately: false,
  beatOnFraction: 0.7,
};
const tileBands = [
  [3, 2, 3, 3000],
  [4, 3, 5, 2750],
  [4, 5, 7, 2500],
  [5, 6, 8, 2250],
  [5, 8, 10, 2000],
  [6, 9, 12, 1750],
  [6, 12, 14, 1500],
];
const rhythmBands = [
  [2, 3, 4, 900],
  [2, 4, 5, 800],
  [2, 5, 6, 700],
  [3, 6, 7, 650],
  [3, 7, 8, 600],
  [4, 8, 9, 550],
  [4, 9, 10, 500],
];
export const directions = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
export type PatternFamily =
  | 'repeat'
  | 'groups'
  | 'increase'
  | 'decrease'
  | 'alphabet'
  | 'multiply'
  | 'differences'
  | 'alternate'
  | 'mixed'
  | 'interleave';
const patternBands: PatternFamily[][] = [
  ['repeat', 'increase', 'decrease'],
  ['increase', 'decrease', 'alphabet', 'groups'],
  ['multiply', 'differences', 'groups'],
  ['alternate', 'mixed'],
  ['alternate', 'differences', 'interleave'],
];
export function getDifficultyConfig(kind: PuzzleKind, level: number) {
  if (!Number.isInteger(level) || level < 1 || level > maxLevels[kind])
    throw new Error(`Invalid ${kind} level: ${level}`);
  const [grid, minTiles, maxTiles, previewMs] =
    tileBands[Math.floor((Math.min(level, 20) - 1) / 3)];
  const [inputCount, minLength, maxLength, beatMs] =
    rhythmBands[Math.floor((Math.min(level, 20) - 1) / 3)];
  return {
    level,
    grid,
    minTiles,
    maxTiles,
    previewMs,
    inputCount,
    minLength,
    maxLength,
    beatMs,
    choices: level <= 4 ? 4 : level <= 12 ? 5 : 6,
    semanticDifficulty: level <= 4 ? 1 : level <= 12 ? 2 : 3,
    categoryCount: level <= 6 ? 2 : 3,
    itemCount: level <= 2 ? 6 : level <= 4 ? 8 : level <= 8 ? 10 : 12,
    families: patternBands[Math.floor((Math.min(level, 10) - 1) / 2)],
    mistakes: settings.mistakes,
  };
}
