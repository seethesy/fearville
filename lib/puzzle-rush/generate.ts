import { preparedPuzzle } from '../rite/bank.ts';
import { generateGrid } from '../rite/grid.ts';
import type { RushKind, RushPuzzle } from './engine.ts';

/** Normal prepared Escape/Lab puzzles avoid certification on a live request.
 * Sphinx uses the same normal three-member clue count, all visible immediately.
 * No table, vigil, identity, social result or turn state is created.
 */
export function generateRush(kind: RushKind, seed: string): RushPuzzle {
  if (kind === 'board' || kind === 'lab') {
    const puzzle = preparedPuzzle(kind, seed);
    delete puzzle.turn;
    return puzzle;
  }
  const puzzle = generateGrid(seed, ['solo','clues-2','clues-3'], [], 0, 0);
  puzzle.clues = puzzle.clues.map(clue=>({...clue,holder:'solo',revealNight:0}));
  return puzzle;
}
