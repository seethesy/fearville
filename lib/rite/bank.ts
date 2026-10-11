import { PUZZLE_BANK } from './bank-data.ts';
import { rng, shuffle } from './random.ts';
import type { BoardState, LabState } from './types.ts';

export function preparedPuzzle(kind: 'board' | 'lab', seed: string): BoardState | LabState {
  const random = rng(seed);
  const puzzles = PUZZLE_BANK[kind];
  const puzzle = structuredClone(puzzles[Math.floor(random() * puzzles.length)]);
  if (puzzle.type === 'lab') {
    const palette = shuffle(Array.from({ length: 10 }, (_, i) => i), random);
    puzzle.vials = shuffle(puzzle.vials, random).map((v, i) => ({
      ...v, id: `v${i}`, shape: Math.floor(random() * 7), layers: v.layers.map((c) => palette[c]),
    }));
    puzzle.original = structuredClone(puzzle.vials);
    puzzle.nightStart = structuredClone(puzzle.vials);
  } else {
    const skins = { 2: ['wood', 'crates', 'car'], 3: ['tree', 'brick', 'coach'] } as const;
    puzzle.blocks = puzzle.blocks.map((b) => b.key ? b : {
      ...b, kind: skins[b.len][Math.floor(random() * 3)],
    });
    puzzle.original = structuredClone(puzzle.blocks);
  }
  return puzzle;
}
