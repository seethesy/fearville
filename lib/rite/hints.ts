// Internal support for a future hint dealer. These facts are never included in
// player views or served by the Rite API.
import type { Squad } from './types.ts';
import { solveBoard } from './board.ts';
import { solveLab } from './lab.ts';
export function riteHint(squad: Squad, performer?: string) {
  const state = squad.state;
  if (state.type === 'board') return solveBoard(state.blocks)?.[0] ?? null;
  if (state.type === 'lab') return solveLab(state.vials)?.[0] ?? null;
  if (state.type === 'grid') return structuredClone(state.solution[0]);
  const ritual = state.rituals[performer ?? squad.members[0]];
  return ritual ? structuredClone(ritual.target[0]) : null;
}
