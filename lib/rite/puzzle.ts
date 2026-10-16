import { preparedPuzzle } from './bank.ts';
import { generateGrid } from './grid.ts';
import { generateRitual } from './ritual.ts';
import {
  PATTERNS,
  type Pattern,
  type Block,
  type Vial,
  type Clue,
  type Triple,
  type Page,
  type Altar,
  type RitualRule,
} from './types.ts';
import {
  puzzleDifficulty,
  type PuzzleDifficulty,
  type GenerationSnapshot,
} from './generation-settings.ts';

// Practice puzzles are independent of tables. This payload must never be built
// from a live squad: solutions are intentionally available for local practice.
export type StandalonePuzzle = {
  pattern: Pattern;
  difficulty: PuzzleDifficulty;
  seed: string;
  revision: number;
  board?: { blocks: Block[]; par: number };
  lab?: { vials: Vial[]; par: number };
  grid?: { clues: Clue[]; solution: Triple[] };
  ritual?: {
    book: Page[];
    omens: number[][];
    altar: Altar;
    target: Altar;
    decoys?: number[][];
    rules?: RitualRule[];
  };
};
export type PuzzleRequest = {
  pattern: Pattern;
  difficulty: PuzzleDifficulty;
  seed: string;
  revision?: number;
};
export function puzzleRequest(raw: unknown): PuzzleRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw Error('Choose a puzzle.');
  const value = raw as Record<string, unknown>;
  if (
    typeof value.pattern !== 'string' ||
    !Object.hasOwn(PATTERNS, value.pattern)
  )
    throw Error('Choose a valid puzzle.');
  if (
    typeof value.seed !== 'string' ||
    !value.seed.trim() ||
    value.seed.length > 80 ||
    value.seed.split('').some((character) => character.charCodeAt(0) < 32)
  )
    throw Error('Use a seed of 1–80 printable characters.');
  if (
    value.revision !== undefined &&
    (typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0)
  )
    throw Error('Invalid puzzle revision.');
  return {
    pattern: value.pattern as Pattern,
    difficulty: puzzleDifficulty(value.difficulty),
    seed: value.seed.trim(),
    ...(value.revision === undefined
      ? {}
      : { revision: value.revision as number }),
  };
}
export function createPuzzle(
  request: PuzzleRequest,
  snapshot: GenerationSnapshot,
): StandalonePuzzle {
  const { pattern, difficulty, seed } = request;
  const options = snapshot.settings.profiles[difficulty];
  const result: StandalonePuzzle = {
    pattern,
    difficulty,
    seed,
    revision: snapshot.revision,
  };
  const generationSeed = `puzzle-v1:${pattern}:${difficulty}:${seed}`;
  if (pattern === 'board' || pattern === 'lab') {
    const state = preparedPuzzle(pattern, generationSeed, options[pattern]);
    if (state.type === 'board')
      result.board = { blocks: state.blocks, par: state.par };
    else result.lab = { vials: state.vials, par: state.par };
  } else if (pattern === 'grid') {
    const state = generateGrid(
      generationSeed,
      ['practice-1', 'practice-2', 'practice-3'],
      [],
      0,
      0,
      { ...options.grid, difficulty },
    );
    result.grid = { clues: state.clues, solution: state.solution };
  } else {
    const state = generateRitual(
      generationSeed,
      ['practice-1', 'practice-2', 'practice-3'],
      [],
      { ...options.ritual, difficulty },
    );
    const ritual = state.rituals['practice-1'];
    result.ritual = {
      book: state.book,
      omens: ritual.omens,
      altar: ritual.altar,
      target: ritual.target,
      rules: ritual.rules,
    };
  }
  return result;
}
