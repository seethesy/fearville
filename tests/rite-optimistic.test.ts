import test from 'node:test';
import assert from 'node:assert/strict';
import { optimisticPuzzle } from '../lib/rite/optimistic.ts';
import type { RitePuzzleView } from '../lib/rite/view.ts';
void test('own board and laboratory moves predict immediately without changing the authoritative view', () => {
  const board: RitePuzzleView = {
    type: 'board',
    phase: 'turn',
    blocks: [
      { id: 'key', kind: 'car', key: true, horiz: true, len: 2, x: 0, y: 2 },
    ],
  };
  const moved = optimisticPuzzle(board, {
    action: 'riteBoardMove',
    block: 'key',
    x: 1,
    y: 2,
  });
  assert.equal(moved.blocks![0].x, 1);
  assert.equal(board.blocks![0].x, 0);
  assert.equal(
    optimisticPuzzle(board, {
      action: 'riteBoardMove',
      block: 'key',
      x: -1,
      y: 2,
    }),
    board,
  );
  const lab: RitePuzzleView = {
    type: 'lab',
    phase: 'turn',
    vials: [
      { id: 'a', shape: 0, layers: [0, 1, 1] },
      { id: 'b', shape: 0, layers: [] },
    ],
  };
  const poured = optimisticPuzzle(lab, {
    action: 'riteLabPour',
    from: 'a',
    to: 'b',
  });
  assert.deepEqual(
    poured.vials!.map((v) => v.layers),
    [[0], [1, 1]],
  );
  assert.deepEqual(lab.vials![0].layers, [0, 1, 1]);
  assert.equal(optimisticPuzzle(lab, { action: 'vote', yes: true }), lab);
});
void test('grid marks and ritual picks are disposable predictions; clearing restores the latest server puzzle', () => {
  const grid: RitePuzzleView = { type: 'grid', phase: 'turn', placements: [] };
  const prediction = optimisticPuzzle(grid, {
    action: 'riteNotes',
    placements: [{ location: 0, character: 1, activity: -1 }],
  });
  assert.equal(prediction.placements![0].character, 1);
  assert.deepEqual(grid.placements, []);
  const ritual: RitePuzzleView = {
    type: 'ritual',
    phase: 'turn',
    altar: [{ control: 'dial', value: 0 }],
  };
  assert.equal(
    optimisticPuzzle(ritual, {
      action: 'riteRitualPick',
      altar: [{ control: 'dial', value: 1 }],
    }).altar![0].value,
    1,
  );
  assert.equal(ritual.altar![0].value, 0);
});
