import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRush,
  rushAction,
  retryRush,
  failRush,
  elapsedRush,
  rushView,
  rushKind,
} from '../lib/puzzle-rush/engine.ts';
import { generateRush } from '../lib/puzzle-rush/generate.ts';
import type { BoardState, LabState, GridState } from '../lib/rite/types.ts';
import { solveGrid } from '../lib/rite/grid.ts';

const blocks: BoardState['blocks'] = [
  { id: 'key', kind: 'carriage', x: 3, y: 2, len: 2, horiz: true, key: true },
];
const board: BoardState = {
  type: 'board',
  blocks,
  original: structuredClone(blocks),
  par: 1,
  solved: false,
};
const vials: LabState['vials'] = [
  { id: 'v0', shape: 0, layers: [0, 1] },
  { id: 'v1', shape: 1, layers: [] },
];
const lab: LabState = {
  type: 'lab',
  vials,
  original: structuredClone(vials),
  nightStart: structuredClone(vials),
  par: 1,
  solved: false,
  history: [],
};
const solution = Array.from({ length: 5 }, (_, i) => ({
  character: i,
  location: i,
  activity: i,
}));
const grid: GridState = {
  type: 'grid',
  solution,
  clues: [{ id: 'true', text: 'A clue', holder: 'someone', revealNight: 9 }],
  placements: {},
  submissions: {},
};

void test('solo Escape uses legal slides, freezes completed time and preserves the initial board', () => {
  const run = startRush(board, 1000);
  assert.throws(() =>
    rushAction(run, 'riteBoardMove', { block: 'key', x: 4, y: 3 }, 2000),
  );
  assert.equal(run.moves, 0);
  const done = rushAction(
    run,
    'riteBoardMove',
    { block: 'key', x: 4, y: 2 },
    2500,
  );
  assert.equal(done.status, 'solved');
  assert.equal(done.moves, 1);
  assert.equal(elapsedRush(done, 9000), 1500);
  assert.equal(board.blocks[0].x, 3);
  assert.throws(() =>
    rushAction(done, 'riteBoardMove', { block: 'key', x: 3, y: 2 }, 3000),
  );
  const retry = retryRush(done, 4000);
  assert.equal(retry.moves, 0);
  assert.equal(retry.startedAt, 4000);
  assert.deepEqual(retry.puzzle, board);
});
void test('solo Lab pours immediately, rejects mismatches, undoes and resets without votes or timers', () => {
  const run = startRush(lab, 0);
  const next = rushAction(run, 'riteLabPour', { from: 'v0', to: 'v1' }, 100);
  assert.equal(
    next.status,
    'playing',
    'partial single-color tubes do not finish standard water sort',
  );
  assert.equal(next.moves, 1);
  assert.throws(() =>
    rushAction(next, 'riteLabPour', { from: 'v1', to: 'v0' }, 200),
  );
  const undo = rushAction(next, 'riteLabCall', { kind: 'undo' }, 200);
  assert.deepEqual((undo.puzzle as LabState).vials, lab.vials);
  const reset = rushAction(next, 'riteLabCall', { kind: 'reset' }, 300);
  assert.deepEqual(reset.puzzle, lab);
  assert.equal(reset.moves, 0);
  const view = rushView(next);
  assert.equal(view.phase, 'turn');
  for (const key of ['deadline', 'turn', 'vote', 'voteResult'])
    assert.ok(!(key in view));
});
void test('solo Lab completes only full or empty monochrome tubes', () => {
  const puzzle = structuredClone(lab);
  puzzle.vials = [
    { id: 'v0', shape: 0, layers: [0, 0] },
    { id: 'v1', shape: 1, layers: [0, 0] },
  ];
  puzzle.original = structuredClone(puzzle.vials);
  const result = rushAction(
    startRush(puzzle, 0),
    'riteLabPour',
    { from: 'v0', to: 'v1' },
    1000,
  );
  assert.equal(result.status, 'solved');
});
void test('Sphinx shows all clues, rejects duplicates and allows another attempt after a wrong answer', () => {
  const run = startRush(grid, 0);
  assert.deepEqual(rushView(run).clues, [
    { id: 'true', text: 'A clue', hidden: false, revealNight: 0 },
  ]);
  const wrong = solution.map((row) => ({
    ...row,
    character: (row.character + 1) % 5,
  }));
  const attempt = rushAction(run, 'riteGridSubmit', { solution: wrong }, 1000);
  assert.equal(attempt.status, 'playing');
  assert.equal(attempt.moves, 1);
  assert.throws(() =>
    rushAction(
      attempt,
      'riteNotes',
      { placements: solution.map((row) => ({ ...row, character: 0 })) },
      1100,
    ),
  );
  const placed = rushAction(
    attempt,
    'riteNotes',
    { placements: solution },
    1200,
  );
  assert.deepEqual(rushView(placed).placements, solution);
  assert.equal(
    rushAction(placed, 'riteGridSubmit', { solution }, 2000).status,
    'solved',
  );
});
void test('there is no time limit; give up freezes result and retry uses the same puzzle', () => {
  const run = startRush(board, 1000);
  assert.equal(elapsedRush(run, 10000001), 9999001);
  assert.equal(run.status, 'playing');
  const failed = failRush(run, 3000);
  assert.equal(failed.status, 'failed');
  assert.equal(elapsedRush(failed, 9999), 2000);
  assert.deepEqual(retryRush(failed, 9000).puzzle, board);
  assert.throws(() => rushKind('ritual'));
  assert.throws(() => rushAction(run, 'ritePass', {}, 2000));
});
void test('normal solo generation is deterministic, independent of tables and has no handoff state', () => {
  for (const kind of ['board', 'lab', 'grid'] as const) {
    const puzzle = generateRush(kind, 'solo-regression');
    assert.deepEqual(puzzle, generateRush(kind, 'solo-regression'));
    assert.ok(!('turn' in puzzle));
    const view = rushView(startRush(puzzle, 0));
    assert.equal(view.phase, 'turn');
    assert.ok(!view.deadline);
    if (puzzle.type === 'grid') {
      assert.equal(puzzle.clues.length, 12);
      assert.ok(
        puzzle.clues.every(
          (c) => !c.forged && c.revealNight === 0 && c.holder === 'solo',
        ),
      );
      assert.equal(solveGrid(puzzle.clues).length, 1);
    }
  }
});
