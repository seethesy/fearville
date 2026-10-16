import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLE_BANK } from '../lib/rite/bank-data.ts';
import { preparedPuzzle } from '../lib/rite/bank.ts';
import {
  BOARD_PAR,
  boardGenerationOptions,
  boardSolved,
  generateBoard,
  slide,
  solveBoard,
} from '../lib/rite/board.ts';
import {
  LAB_COLORS,
  LAB_EMPTY,
  LAB_PAR,
  generateLab,
  labGenerationOptions,
  labSolved,
  pour,
  solveLab,
} from '../lib/rite/lab.ts';
import {
  DEFAULT_GENERATION,
  DIFFICULTIES,
} from '../lib/rite/generation-settings.ts';
import type { Block, BoardState, LabState, Vial } from '../lib/rite/types.ts';

function validBoard(blocks: Block[]) {
  assert.equal(new Set(blocks.map((block) => block.id)).size, blocks.length);
  const keys = blocks.filter((block) => block.key);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].horiz, true);
  assert.equal(keys[0].y, 2);
  const occupied = new Set<number>();
  for (const block of blocks) {
    assert.ok([2, 3].includes(block.len));
    for (let i = 0; i < block.len; i++) {
      const x = block.x + (block.horiz ? i : 0);
      const y = block.y + (block.horiz ? 0 : i);
      assert.ok(Number.isInteger(x) && x >= 0 && x < 6);
      assert.ok(Number.isInteger(y) && y >= 0 && y < 6);
      assert.ok(!occupied.has(y * 6 + x), 'Blocks must never overlap');
      occupied.add(y * 6 + x);
    }
  }
}

function validLab(vials: Vial[], colors: number, emptyVials = 2) {
  assert.equal(vials.length, colors + emptyVials);
  assert.equal(new Set(vials.map((vial) => vial.id)).size, vials.length);
  const counts = new Map<number, number>();
  for (const vial of vials) {
    assert.ok(vial.layers.length <= 4);
    assert.ok(
      Number.isInteger(vial.shape) && vial.shape >= 0 && vial.shape < 7,
    );
    for (const color of vial.layers) {
      assert.ok(Number.isInteger(color) && color >= 0 && color < 10);
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }
  assert.equal(counts.size, colors);
  assert.ok([...counts.values()].every((count) => count === 4));
}

function solveAndPlayBoard(puzzle: BoardState) {
  validBoard(puzzle.blocks);
  assert.equal(boardSolved(puzzle.blocks), false);
  assert.equal(puzzle.solved, false);
  assert.deepEqual(puzzle.original, puzzle.blocks);
  const path = solveBoard(puzzle.blocks, 200000);
  assert.ok(path);
  assert.equal(path.length, puzzle.par);
  assert.equal(puzzle.distance, puzzle.par);
  let blocks = puzzle.blocks;
  for (const move of path) {
    const next = slide(blocks, move);
    assert.ok(next);
    blocks = next;
  }
  validBoard(blocks);
  assert.equal(boardSolved(blocks), true);
}

function solveAndPlayLab(puzzle: LabState, colors: number) {
  validLab(puzzle.vials, colors);
  assert.equal(labSolved(puzzle.vials), false);
  assert.equal(puzzle.solved, false);
  assert.deepEqual(puzzle.original, puzzle.vials);
  assert.deepEqual(puzzle.nightStart, puzzle.vials);
  const path = solveLab(puzzle.vials, 200000);
  assert.ok(path);
  assert.equal(path.length, puzzle.par);
  assert.equal(puzzle.distance, puzzle.par);
  let vials = puzzle.vials;
  for (const move of path) {
    const next = pour(vials, move);
    assert.ok(next);
    vials = next;
  }
  validLab(vials, colors);
  assert.equal(labSolved(vials), true);
}

void test('the complete movement catalogue contains playable, optimal certificates', () => {
  assert.equal(PUZZLE_BANK.board.length, 80);
  assert.equal(PUZZLE_BANK.lab.length, 72);
  for (const entry of PUZZLE_BANK.board) {
    solveAndPlayBoard(entry.puzzle);
    assert.equal(entry.solution.length, entry.puzzle.par);
    let blocks = entry.puzzle.blocks;
    for (const move of entry.solution) {
      const next = slide(blocks, move);
      assert.ok(next, 'Stored Escape certificate must play back legally');
      blocks = next;
    }
    assert.ok(boardSolved(blocks));
  }
  for (const entry of PUZZLE_BANK.lab) {
    solveAndPlayLab(entry.puzzle, entry.colors);
    assert.equal(entry.emptyVials, 2);
    assert.equal(entry.solution.length, entry.puzzle.par);
    let vials = entry.puzzle.vials;
    for (const move of entry.solution) {
      const next = pour(vials, move);
      assert.ok(next, 'Stored Laboratory certificate must play back legally');
      vials = next;
    }
    assert.ok(labSolved(vials));
  }
});

void test('each movement difficulty supports both endpoints and reproducible, exact par', () => {
  for (const difficulty of DIFFICULTIES) {
    const profile = DEFAULT_GENERATION.profiles[difficulty];
    for (const endpoint of ['minMoves', 'maxMoves'] as const) {
      const boardOptions = {
        ...profile.board,
        minMoves: profile.board[endpoint],
        maxMoves: profile.board[endpoint],
      };
      const labOptions = {
        ...profile.lab,
        minMoves: profile.lab[endpoint],
        maxMoves: profile.lab[endpoint],
      };
      const seed = `endpoint-${difficulty}-${endpoint}`;
      const board = preparedPuzzle('board', seed, boardOptions);
      const lab = preparedPuzzle('lab', seed, labOptions);
      assert.equal(board.par, boardOptions.minMoves);
      assert.equal(lab.par, labOptions.minMoves);
      assert.deepEqual(board, preparedPuzzle('board', seed, boardOptions));
      assert.deepEqual(lab, preparedPuzzle('lab', seed, labOptions));
      solveAndPlayBoard(board);
      solveAndPlayLab(lab, profile.lab.colors);
    }
    for (let index = 0; index < 12; index++) {
      const seed = `profile-${difficulty}-${index}`;
      const board = preparedPuzzle('board', seed, profile.board);
      const lab = preparedPuzzle('lab', seed, profile.lab);
      assert.ok(
        board.par >= profile.board.minMoves &&
          board.par <= profile.board.maxMoves,
      );
      assert.ok(
        lab.par >= profile.lab.minMoves && lab.par <= profile.lab.maxMoves,
      );
    }
  }
});

void test('even one-move puzzles vary structurally without counting skins, labels or vial order', () => {
  const boards = new Set<string>();
  const laboratories = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    const board = preparedPuzzle('board', `diversity-${seed}`, {
      minMoves: 1,
      maxMoves: 1,
      maxRemovedBlocks: 3,
    });
    // Ignore IDs, skins and movable positions; distinct fixed lanes and
    // blocker lengths require genuinely different spatial arrangements.
    boards.add(
      board.blocks
        .map((block) =>
          [
            block.horiz ? 'h' : 'v',
            block.horiz ? block.y : block.x,
            block.len,
            !!block.key,
          ].join(':'),
        )
        .sort()
        .join('|'),
    );
    const lab = preparedPuzzle('lab', `diversity-${seed}`, {
      minMoves: 1,
      maxMoves: 1,
      colors: 4,
    });
    // Normalize every vial's colors by first appearance, then sort vials.
    // This deliberately undercounts variety: different palettes, shapes,
    // vial permutations or cross-vial color relationships cannot inflate it.
    laboratories.add(
      lab.vials
        .map((vial) => {
          const labels = new Map<number, number>();
          return vial.layers
            .map((color) => {
              if (!labels.has(color)) labels.set(color, labels.size);
              return labels.get(color);
            })
            .join('');
        })
        .sort()
        .join('|'),
    );
    assert.equal(solveBoard(board.blocks, 200000)?.length, 1);
    assert.equal(solveLab(lab.vials, 200000)?.length, 1);
  }
  assert.ok(boards.size >= 20, `${boards.size} distinct Escape geometries`);
  assert.ok(
    laboratories.size >= 6,
    `${laboratories.size} distinct liquid arrangements`,
  );
});

void test('offline generators honor difficulty settings and keep legacy defaults', () => {
  assert.deepEqual(BOARD_PAR, [28, 32]);
  assert.deepEqual(LAB_PAR, [28, 32]);
  assert.equal(LAB_COLORS, 10);
  assert.equal(LAB_EMPTY, 2);
  for (const difficulty of DIFFICULTIES) {
    const profile = DEFAULT_GENERATION.profiles[difficulty];
    const seed = `offline-${difficulty}`;
    const board = generateBoard(seed, 3, profile.board);
    const lab = generateLab(seed, 3, profile.lab);
    assert.deepEqual(board, generateBoard(seed, 3, profile.board));
    assert.deepEqual(lab, generateLab(seed, 3, profile.lab));
    assert.ok(
      board.par >= profile.board.minMoves &&
        board.par <= profile.board.maxMoves,
    );
    assert.ok(
      lab.par >= profile.lab.minMoves && lab.par <= profile.lab.maxMoves,
    );
    solveAndPlayBoard(board);
    solveAndPlayLab(lab, profile.lab.colors);
  }
  const board = generateBoard('legacy-defaults', 3);
  const lab = generateLab('legacy-defaults', 3);
  assert.ok(board.par >= BOARD_PAR[0] && board.par <= BOARD_PAR[1]);
  assert.ok(lab.par >= LAB_PAR[0] && lab.par <= LAB_PAR[1]);
  solveAndPlayBoard(board);
  solveAndPlayLab(lab, LAB_COLORS);
  assert.deepEqual(
    preparedPuzzle('board', 'legacy-prepared'),
    preparedPuzzle(
      'board',
      'legacy-prepared',
      DEFAULT_GENERATION.profiles.hard.board,
    ),
  );
  assert.deepEqual(
    preparedPuzzle('lab', 'legacy-prepared'),
    preparedPuzzle(
      'lab',
      'legacy-prepared',
      DEFAULT_GENERATION.profiles.hard.lab,
    ),
  );
});

void test('movement generation rejects invalid settings and fails within explicit search budgets', () => {
  for (const options of [
    { minMoves: 0 },
    { minMoves: NaN },
    { maxMoves: Infinity },
    { minMoves: 5, maxMoves: 4 },
    { candidateLimit: 0 },
    { candidateLimit: 129 },
    { searchLimit: 99 },
    { searchLimit: 200001 },
  ]) {
    assert.throws(() => boardGenerationOptions(options));
    assert.throws(() => labGenerationOptions(options));
  }
  assert.throws(() => boardGenerationOptions({ maxRemovedBlocks: 1.5 }));
  assert.throws(() => labGenerationOptions({ colors: 11 }));
  assert.throws(() => labGenerationOptions({ emptyVials: 0 }));
  for (let repeat = 0; repeat < 2; repeat++) {
    assert.throws(
      () =>
        generateBoard('exhaustion', 3, {
          minMoves: 40,
          maxMoves: 40,
          candidateLimit: 1,
          searchLimit: 100,
        }),
      /within the generation budget/,
    );
    assert.throws(
      () =>
        generateLab('exhaustion', 3, {
          minMoves: 40,
          maxMoves: 40,
          colors: 3,
          candidateLimit: 1,
          searchLimit: 100,
        }),
      /within the generation budget/,
    );
  }
  assert.throws(
    () => preparedPuzzle('board', 'invalid', { maxMoves: 33 }),
    /catalogue supports/,
  );
  assert.throws(
    () => preparedPuzzle('board', 'invalid', { maxRemovedBlocks: 4 }),
    /catalogue supports/,
  );
  assert.throws(
    () => preparedPuzzle('lab', 'invalid', { colors: 5 }),
    /catalogue supports/,
  );
  assert.throws(
    () => preparedPuzzle('lab', 'invalid', { emptyVials: 1 }),
    /catalogue supports/,
  );
  assert.throws(
    () =>
      preparedPuzzle('lab', 'invalid', {
        colors: 4,
        minMoves: 1,
        maxMoves: 10,
      }),
    /catalogue supports/,
  );
});

void test('prepared movement states never mutate their offline certificates or another deal', () => {
  const board = preparedPuzzle('board', 'isolated');
  const lab = preparedPuzzle('lab', 'isolated');
  const beforeBoard = structuredClone(board);
  const beforeLab = structuredClone(lab);
  board.blocks[0].x = -99;
  board.original[0].kind = 'wood';
  lab.vials[0].layers.push(99);
  lab.original[0].layers.push(99);
  lab.nightStart[0].layers.push(99);
  assert.deepEqual(preparedPuzzle('board', 'isolated'), beforeBoard);
  assert.deepEqual(preparedPuzzle('lab', 'isolated'), beforeLab);
});
