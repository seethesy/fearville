import { PUZZLE_BANK } from './bank-data.ts';
import { rng, shuffle } from './random.ts';
import type { BoardState, LabState } from './types.ts';
import { GENERATOR_STYLE, PUZZLE_PRESETS } from './generator-config.ts';

export function preparedPuzzle(
  kind: 'board' | 'lab',
  seed: string,
): BoardState | LabState {
  const random = rng(seed);
  const puzzles = PUZZLE_BANK[kind];
  const puzzle = structuredClone(
    puzzles[Math.floor(random() * puzzles.length)],
  );
  if (puzzle.type === 'lab') {
    const palette = shuffle(
      Array.from({ length: PUZZLE_PRESETS.normal.lab.colors }, (_, i) => i),
      random,
    );
    puzzle.vials = shuffle(puzzle.vials, random).map((v, i) => ({
      ...v,
      id: `v${i}`,
      shape: Math.floor(random() * GENERATOR_STYLE.lab.shapes),
      layers: v.layers.map((c) => palette[c]),
    }));
    puzzle.original = structuredClone(puzzle.vials);
    puzzle.nightStart = structuredClone(puzzle.vials);
  } else {
    const skins = GENERATOR_STYLE.board.skins;
    puzzle.blocks = puzzle.blocks.map((b) =>
      b.key
        ? b
        : {
            ...b,
            kind: skins[b.len][Math.floor(random() * 3)],
          },
    );
    puzzle.original = structuredClone(puzzle.blocks);
  }
  return puzzle;
}
