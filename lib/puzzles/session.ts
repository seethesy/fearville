import { getDifficultyConfig, settings, type PuzzleKind } from './config.ts';
import { generatePuzzle, type Content } from './generate.ts';
export type PuzzleState = {
  content: Content;
  level: number;
  seed: string | number;
  status: 'preview' | 'playing' | 'success' | 'failure';
  mistakes: number;
  correct: number;
  cursor: number;
  selected: number[];
  entered: string[];
  shown: string[];
};
export type PuzzleInput =
  | { type: 'ready' }
  | { type: 'answer'; value: string | number };
export interface Puzzle {
  start(level: number, seed?: string | number): PuzzleState;
  input(state: PuzzleState, input: PuzzleInput): PuzzleState;
  restart(state: PuzzleState, sameContent?: boolean): PuzzleState;
}
export function start(
  kind: PuzzleKind,
  level: number,
  seed: string | number = crypto.randomUUID(),
): PuzzleState {
  const content = generatePuzzle(kind, level, seed);
  return {
    content,
    level,
    seed,
    status: kind === 'tiles' || kind === 'rhythm' ? 'preview' : 'playing',
    mistakes: 0,
    correct: 0,
    cursor: 0,
    selected: [],
    entered: [],
    shown: [],
  };
}
export function input(state: PuzzleState, action: PuzzleInput): PuzzleState {
  if (action.type === 'ready')
    return state.status === 'preview' ? { ...state, status: 'playing' } : state;
  if (state.status !== 'playing') return state;
  const p = state.content,
    value = action.value;
  const s = { ...state };
  let correct = false,
    finished = false;
  if (p.kind === 'tiles') {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >= p.grid * p.grid ||
      s.selected.includes(value)
    )
      return state;
    s.selected = [...s.selected, value];
    correct = p.highlighted.includes(value);
    finished = p.highlighted.every((n) => s.selected.includes(n));
  } else if (p.kind === 'words') {
    if (value !== 'NEW' && value !== 'SEEN') return state;
    const word = p.sequence[s.cursor];
    correct = value === (s.shown.includes(word) ? 'SEEN' : 'NEW');
    s.shown = [...s.shown, word];
    s.cursor++;
    finished = s.cursor === p.sequence.length;
  } else if (p.kind === 'rhythm') {
    if (typeof value !== 'string' || !p.inputs.includes(value)) return state;
    s.entered = [...s.entered, value];
    s.cursor++;
    finished = s.cursor === p.sequence.length;
    correct = value === p.sequence[s.cursor - 1];
    if (!finished && !settings.rhythmFailImmediately) return s;
    s.status =
      finished && s.entered.every((x, i) => x === p.sequence[i])
        ? 'success'
        : !correct || finished
          ? 'failure'
          : 'playing';
    return s;
  } else if (p.kind === 'sorting') {
    if (typeof value !== 'string' || !p.categories.includes(value))
      return state;
    correct = value === p.items[s.cursor].category;
    if (correct) s.cursor++;
    finished = s.cursor === p.items.length;
  } else {
    if (typeof value !== 'string' || !p.options.includes(value)) return state;
    correct = value === p.answer;
    s.status = correct ? 'success' : 'failure';
    s.correct = Number(correct);
    s.mistakes = Number(!correct);
    return s;
  }
  if (correct) s.correct++;
  else s.mistakes++;
  s.status =
    s.mistakes >= getDifficultyConfig(p.kind, s.level).mistakes
      ? 'failure'
      : finished
        ? 'success'
        : 'playing';
  return s;
}
export function createPuzzle(kind: PuzzleKind): Puzzle {
  return {
    start: (level, seed) => start(kind, level, seed),
    input,
    restart: (s, sameContent = false) =>
      start(kind, s.level, sameContent ? s.seed : undefined),
  };
}
