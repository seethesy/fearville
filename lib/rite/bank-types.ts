import type { Slide } from './board.ts';
import type { Pour } from './lab.ts';
import type { BoardState, LabState } from './types.ts';

export type PuzzleBank = {
  board: {
    puzzle: BoardState;
    solution: Slide[];
    maxRemovedBlocks: number;
  }[];
  lab: {
    puzzle: LabState;
    solution: Pour[];
    colors: number;
    emptyVials: number;
  }[];
};
