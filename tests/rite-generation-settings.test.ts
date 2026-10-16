import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GENERATION,
  DIFFICULTIES,
  generationSettings,
  movementOptions,
  puzzleDifficulty,
} from '../lib/rite/generation-settings.ts';
import { createPuzzle, puzzleRequest } from '../lib/rite/puzzle.ts';
import { PATTERNS, type Pattern } from '../lib/rite/types.ts';
import { solveGrid } from '../lib/rite/grid.ts';
import { decodeRitual } from '../lib/rite/ritual.ts';

void test('generation settings validate and detach every published profile from caller and defaults', () => {
  const draft = structuredClone(DEFAULT_GENERATION);
  draft.nightDifficulty = 'standard';
  draft.profiles.hard.ritual.ruleDepth = 6;
  const settings = generationSettings({ ...draft, secret: 'discard me' });
  assert.deepEqual(settings, draft);
  draft.profiles.easy.grid.candidateCount = 64;
  settings.profiles.standard.grid.candidateCount = 8;
  assert.equal(settings.profiles.easy.grid.candidateCount, 16);
  assert.equal(DEFAULT_GENERATION.profiles.standard.grid.candidateCount, 24);
  const movement = movementOptions(settings.profiles.easy, 'board');
  movement.minMoves = 1;
  assert.equal(settings.profiles.easy.board.minMoves, 5);
  assert.equal(Object.hasOwn(settings, 'secret'), false);
});

void test('generation settings reject malformed values, unsupported budgets and inconsistent progression', () => {
  for (const value of [
    null,
    [],
    '',
    1,
    {},
    { ...DEFAULT_GENERATION, version: 2 },
    { ...DEFAULT_GENERATION, profiles: {} },
  ])
    assert.throws(() => generationSettings(value));
  for (const value of [NaN, Infinity, -Infinity, 8.5, '16', 7, 65, undefined]) {
    const draft = structuredClone(DEFAULT_GENERATION);
    (
      draft.profiles.easy.grid as unknown as Record<string, unknown>
    ).candidateCount = value;
    assert.throws(() => generationSettings(draft), /Candidate clue sets/);
  }
  for (const change of [
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.easy.board.minMoves = 10;
    },
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.standard.board.minMoves = 9;
    },
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.easy.lab.colors = 5;
    },
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.easy.lab.maxMoves = 10;
    },
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.standard.ritual.ruleDepth = 1;
    },
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.hard.grid.targetRounds = 1;
    },
    (draft: typeof DEFAULT_GENERATION) => {
      draft.profiles.hard.ritual.linkedRules = 0;
    },
  ]) {
    const draft = structuredClone(DEFAULT_GENERATION);
    change(draft);
    assert.throws(() => generationSettings(draft));
  }
  assert.throws(() => puzzleDifficulty('expert'), /easy, standard, or hard/);
});

void test('practice requests allowlist inputs, normalize seeds and enforce finite generation inputs', () => {
  assert.deepEqual(
    puzzleRequest({
      pattern: 'grid',
      difficulty: 'easy',
      seed: '  share-me  ',
      revision: 0,
      table: 'LIVE',
      player: 'secret',
      solution: [],
    }),
    {
      pattern: 'grid',
      difficulty: 'easy',
      seed: 'share-me',
      revision: 0,
    },
  );
  assert.equal(
    puzzleRequest({
      pattern: 'ritual',
      difficulty: 'hard',
      seed: 'a'.repeat(80),
    }).seed.length,
    80,
  );
  const valid = { pattern: 'grid', difficulty: 'easy', seed: 'seed' };
  for (const value of [null, [], '', 1])
    assert.throws(() => puzzleRequest(value));
  for (const pattern of ['constructor', '__proto__', 'toString', '', 1, null])
    assert.throws(() => puzzleRequest({ ...valid, pattern }), /valid puzzle/);
  for (const seed of [
    '',
    '   ',
    'a'.repeat(81),
    'line\nbreak',
    'null\0byte',
    1,
  ])
    assert.throws(
      () => puzzleRequest({ ...valid, seed }),
      /printable characters/,
    );
  for (const revision of [
    -1,
    1.1,
    Infinity,
    NaN,
    Number.MAX_SAFE_INTEGER + 1,
    '0',
  ])
    assert.throws(() => puzzleRequest({ ...valid, revision }), /revision/);
  assert.throws(
    () => puzzleRequest({ ...valid, difficulty: 'admin' }),
    /difficulty/,
  );
});

void test('every standalone profile creates a deterministic independently solvable puzzle with pinned revision', () => {
  const snapshot = {
    revision: 17,
    settings: generationSettings(DEFAULT_GENERATION),
  };
  const before = structuredClone(snapshot);
  for (const difficulty of DIFFICULTIES)
    for (const pattern of Object.keys(PATTERNS) as Pattern[]) {
      const request = puzzleRequest({
        pattern,
        difficulty,
        seed: 'catalogue-test',
        revision: 17,
      });
      const puzzle = createPuzzle(request, snapshot);
      assert.deepEqual(puzzle, createPuzzle(request, snapshot));
      assert.equal(puzzle.revision, 17);
      assert.equal(puzzle.pattern, pattern);
      assert.equal(puzzle.difficulty, difficulty);
      assert.deepEqual(
        Object.keys(puzzle).sort(),
        ['pattern', 'difficulty', 'seed', 'revision', pattern].sort(),
      );
      const profile = snapshot.settings.profiles[difficulty];
      if (puzzle.board) {
        assert.ok(
          puzzle.board.par >= profile.board.minMoves &&
            puzzle.board.par <= profile.board.maxMoves,
        );
        assert.ok(puzzle.board.blocks.length > 1);
      }
      if (puzzle.lab) {
        assert.ok(
          puzzle.lab.par >= profile.lab.minMoves &&
            puzzle.lab.par <= profile.lab.maxMoves,
        );
        assert.equal(
          new Set(puzzle.lab.vials.flatMap((vial) => vial.layers)).size,
          profile.lab.colors,
        );
      }
      if (puzzle.grid) {
        assert.deepEqual(solveGrid(puzzle.grid.clues), [puzzle.grid.solution]);
        assert.equal(puzzle.grid.clues.length, 12);
        assert.ok(puzzle.grid.clues.every((clue) => !clue.forged));
      }
      if (puzzle.ritual) {
        const decoded = decodeRitual(
          puzzle.ritual.book,
          puzzle.ritual.omens,
          puzzle.ritual.rules,
        );
        assert.ok(decoded);
        const byControl = (altar: typeof decoded) =>
          [...altar].sort((a, b) => a.control.localeCompare(b.control));
        assert.deepEqual(byControl(decoded), byControl(puzzle.ritual.target));
        assert.equal(
          puzzle.ritual.rules?.length ?? 0,
          profile.ritual.ruleDepth,
        );
        assert.equal(
          puzzle.ritual.rules?.filter((rule) => rule.kind === 'link').length ??
            0,
          profile.ritual.linkedRules,
        );
      }
    }
  assert.deepEqual(snapshot, before);
});
