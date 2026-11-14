import { PUZZLE_BANK } from './bank-data.ts';
import {
  boardGenerationOptions,
  slide,
  type BoardGenerationOptions,
} from './board.ts';
import {
  labGenerationOptions,
  pour,
  type LabGenerationOptions,
} from './lab.ts';
import { rng, shuffle } from './random.ts';
import type { BoardState, LabState } from './types.ts';

// Every suffix of a shortest path is shortest. Taking a seeded suffix of an
// offline certificate changes the actual puzzle and its exact difficulty
// without performing any search in a player request.
export function preparedPuzzle(
  kind: 'board',
  seed: string,
  options?: BoardGenerationOptions,
): BoardState;
export function preparedPuzzle(
  kind: 'lab',
  seed: string,
  options?: LabGenerationOptions,
): LabState;
export function preparedPuzzle(
  kind: 'board' | 'lab',
  seed: string,
  options?: BoardGenerationOptions | LabGenerationOptions,
): BoardState | LabState;
export function preparedPuzzle(
  kind: 'board' | 'lab',
  seed: string,
  options: BoardGenerationOptions | LabGenerationOptions = {},
): BoardState | LabState {
  const random = rng(seed);
  if (kind === 'board') {
    const settings = boardGenerationOptions(options);
    if (settings.maxMoves > 32 || settings.maxRemovedBlocks > 3)
      throw new Error(
        'The Escape catalogue supports 1–32 slides and removal budgets from 0–3.',
      );
    const entries = PUZZLE_BANK.board.filter(
      (entry) =>
        entry.maxRemovedBlocks <= settings.maxRemovedBlocks &&
        entry.solution.length >= settings.minMoves,
    );
    if (!entries.length)
      throw new Error('No certified Escape puzzle matches these settings.');
    const entry = entries[Math.floor(random() * entries.length)];
    const target =
      settings.minMoves +
      Math.floor(
        random() *
          (Math.min(entry.solution.length, settings.maxMoves) -
            settings.minMoves +
            1),
      );
    const puzzle = structuredClone(entry.puzzle);
    for (const move of entry.solution.slice(
      0,
      entry.solution.length - target,
    )) {
      const next = slide(puzzle.blocks, move);
      if (!next)
        throw new Error('Escape catalogue contains an invalid certificate.');
      puzzle.blocks = next;
    }
    const skins = {
      2: ['wood', 'crates', 'car'],
      3: ['tree', 'brick', 'coach'],
    } as const;
    puzzle.blocks = puzzle.blocks.map((block) =>
      block.key
        ? block
        : {
            ...block,
            kind: skins[block.len][Math.floor(random() * 3)],
          },
    );
    puzzle.original = structuredClone(puzzle.blocks);
    puzzle.par = puzzle.distance = target;
    return puzzle;
  }
  const settings = labGenerationOptions(options);
  const maxMoves =
    settings.colors === 4
      ? 9
      : settings.colors === 7
        ? 20
        : settings.colors === 10
          ? 32
          : 0;
  if (!maxMoves || settings.emptyVials !== 2 || settings.maxMoves > maxMoves)
    throw new Error(
      'The Laboratory catalogue supports 4, 7 or 10 liquids with two spare vials and at most 9, 20 or 32 pours respectively.',
    );
  const entries = PUZZLE_BANK.lab.filter(
    (entry) =>
      entry.colors === settings.colors &&
      entry.emptyVials === settings.emptyVials &&
      entry.solution.length >= settings.minMoves,
  );
  if (!entries.length)
    throw new Error('No certified Laboratory puzzle matches these settings.');
  const entry = entries[Math.floor(random() * entries.length)];
  const target =
    settings.minMoves +
    Math.floor(
      random() *
        (Math.min(entry.solution.length, settings.maxMoves) -
          settings.minMoves +
          1),
    );
  const puzzle = structuredClone(entry.puzzle);
  for (const move of entry.solution.slice(0, entry.solution.length - target)) {
    const next = pour(puzzle.vials, move);
    if (!next)
      throw new Error('Laboratory catalogue contains an invalid certificate.');
    puzzle.vials = next;
  }
  const palette = shuffle(
    Array.from({ length: 10 }, (_, i) => i),
    random,
  );
  puzzle.vials = shuffle(puzzle.vials, random).map((vial, i) => ({
    ...vial,
    id: `v${i}`,
    shape: Math.floor(random() * 7),
    layers: vial.layers.map((color) => palette[color]),
  }));
  puzzle.original = structuredClone(puzzle.vials);
  puzzle.nightStart = structuredClone(puzzle.vials);
  puzzle.par = puzzle.distance = target;
  return puzzle;
}
