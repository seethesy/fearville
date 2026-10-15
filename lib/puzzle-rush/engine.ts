import type { BoardState, LabState, GridState, Triple } from '../rite/types.ts';
import type { RitePuzzleView } from '../rite/view.ts';
import { slide, boardSolved } from '../rite/board.ts';
import { pour, labSolved } from '../rite/lab.ts';
import { validPlacements, validTriples, sameSolution } from '../rite/grid.ts';

export type RushKind = 'board' | 'grid' | 'lab';
export type RushPuzzle = BoardState | LabState | GridState;
export type RushRun = {
  original: RushPuzzle;
  puzzle: RushPuzzle;
  moves: number;
  startedAt: number;
  endedAt?: number;
  status: 'playing' | 'solved' | 'failed';
};
export function rushKind(value: string): RushKind {
  if (value !== 'board' && value !== 'grid' && value !== 'lab') throw Error('Choose Escape, Sphinx or Laboratory.');
  return value;
}
export function startRush(puzzle: RushPuzzle, at: number): RushRun {
  return { original: structuredClone(puzzle), puzzle: structuredClone(puzzle), moves: 0, startedAt: at, status: 'playing' };
}
export const elapsedRush = (run: RushRun, now: number) => Math.max(0, (run.endedAt ?? now) - run.startedAt);
export const retryRush = (run: RushRun, at: number) => startRush(run.original, at);
export const failRush = (run: RushRun, at: number): RushRun => run.status === 'playing' ? { ...run, status:'failed', endedAt:at } : run;

/** Entirely local solo state; never calls the table engine or writes results. */
export function rushAction(run: RushRun, action: string, payload: Record<string, unknown>, at: number): RushRun {
  if (run.status !== 'playing') throw Error('Start the next puzzle or retry.');
  const puzzle = structuredClone(run.puzzle);
  let solved = false;
  if (puzzle.type === 'board' && action === 'riteBoardMove') {
    const next = slide(puzzle.blocks, { block:String(payload.block), x:Number(payload.x), y:Number(payload.y) });
    if (!next) throw Error('That piece cannot move there.');
    puzzle.blocks = next;
    solved = puzzle.solved = boardSolved(next);
  } else if (puzzle.type === 'lab' && action === 'riteLabPour') {
    const from = String(payload.from), to = String(payload.to);
    const next = pour(puzzle.vials, {from,to});
    if (!next) throw Error('Pour onto the same liquid or into an empty vial with room.');
    puzzle.history.push({ night:0, before:puzzle.vials, from, to });
    puzzle.vials = next;
    // Standard solo water sort: partial monochrome vials must still be merged.
    solved = puzzle.solved = labSolved(next) && next.every(v=>v.layers.length === 0 || v.layers.length === 4);
  } else if (puzzle.type === 'lab' && action === 'riteLabCall') {
    if (payload.kind === 'reset') return retryRush(run, at);
    if (payload.kind !== 'undo') throw Error('Unknown solo laboratory action.');
    const last = puzzle.history.pop();
    if (!last) throw Error('No pour to undo.');
    puzzle.vials = last.before;
    puzzle.solved = false;
  } else if (puzzle.type === 'grid' && action === 'riteNotes') {
    if (!validPlacements(payload.placements)) throw Error('Choose each character and activity at most once.');
    puzzle.placements.solo = payload.placements;
  } else if (puzzle.type === 'grid' && action === 'riteGridSubmit') {
    if (!validTriples(payload.solution)) throw Error('Fill every place with one character and one activity.');
    solved = sameSolution(payload.solution, puzzle.solution);
    puzzle.submissions.solo = payload.solution as Triple[];
    // A wrong answer is an attempt, not the end of an untimed puzzle.
  } else throw Error('That action does not belong to this solo puzzle.');
  return { ...run, puzzle, moves:run.moves + 1, status:solved ? 'solved' : 'playing', ...(solved ? {endedAt:at} : {}) };
}

export function rushView(run: RushRun): RitePuzzleView {
  const puzzle = run.puzzle;
  const base = { type:puzzle.type, phase:run.status === 'playing' ? 'turn' as const : 'done' as const };
  if (puzzle.type === 'board') return { ...base, blocks:puzzle.blocks };
  if (puzzle.type === 'lab') return { ...base, vials:puzzle.vials, canUndo:puzzle.history.length > 0 };
  return { ...base, clues:puzzle.clues.map(c=>({id:c.id,text:c.text,hidden:false,revealNight:0})), placements:puzzle.placements.solo ?? [] };
}
