import { slide } from './board.ts';
import { pour } from './lab.ts';
import type { Command } from '../game/types.ts';
import type { RitePuzzleView } from './view.ts';
import type { Altar, Triple } from './types.ts';
// Predict only the acting player's already-authorized puzzle.
export function optimisticPuzzle(
  puzzle: RitePuzzleView,
  command: Command,
): RitePuzzleView {
  if (command.action === 'riteBoardMove' && puzzle.blocks) {
    const blocks = slide(puzzle.blocks, {
      block: String(command.block),
      x: Number(command.x),
      y: Number(command.y),
    });
    return blocks ? { ...puzzle, blocks } : puzzle;
  }
  if (command.action === 'riteLabPour' && puzzle.vials) {
    const vials = pour(puzzle.vials, {
      from: String(command.from),
      to: String(command.to),
    });
    return vials ? { ...puzzle, vials } : puzzle;
  }
  if (command.action === 'riteNotes' && Array.isArray(command.placements))
    return {
      ...puzzle,
      placements: structuredClone(command.placements) as Triple[],
    };
  if (command.action === 'riteRitualPick' && Array.isArray(command.altar))
    return { ...puzzle, altar: structuredClone(command.altar) as Altar };
  return puzzle;
}
