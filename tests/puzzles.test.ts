import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDifficultyConfig,
  maxLevels,
  settings,
  type PuzzleKind,
} from '../lib/puzzles/config.ts';
import { generatePuzzle, validatePuzzle } from '../lib/puzzles/generate.ts';
import { createPuzzle, input, start } from '../lib/puzzles/session.ts';
import { getCategory } from '../lib/puzzles/words.ts';
const kinds = Object.keys(maxLevels) as PuzzleKind[];
for (const kind of kinds) {
  void test(`${kind}: every level generates valid reproducible content across 100 seeds`, () => {
    for (let level = 1; level <= maxLevels[kind]; level++) {
      const variants = new Set<string>();
      for (let seed = 0; seed < 100; seed++) {
        const p = generatePuzzle(kind, level, seed);
        assert.ok(validatePuzzle(p, level));
        assert.deepEqual(p, generatePuzzle(kind, level, seed));
        variants.add(JSON.stringify(p));
      }
      assert.ok(variants.size > 1);
    }
  });
  void test(`${kind}: rejects invalid levels`, () => {
    for (const level of [0, -1, 1.5, NaN, Infinity, maxLevels[kind] + 1])
      assert.throws(() => start(kind, level, 1), /Invalid/);
  });
  void test(`${kind}: correct answers succeed and terminal states ignore input`, () => {
    let s = start(kind, maxLevels[kind], 42);
    s = input(s, { type: 'ready' });
    for (let i = 0; i < 100 && s.status === 'playing'; i++) {
      const p = s.content;
      const answer =
        p.kind === 'tiles'
          ? p.highlighted.find((n) => !s.selected.includes(n))!
          : p.kind === 'words'
            ? s.shown.includes(p.sequence[s.cursor])
              ? 'SEEN'
              : 'NEW'
            : p.kind === 'rhythm'
              ? p.sequence[s.cursor]
              : p.kind === 'sorting'
                ? p.items[s.cursor].category
                : p.answer;
      s = input(s, { type: 'answer', value: answer });
    }
    assert.equal(s.status, 'success');
    assert.equal(input(s, { type: 'answer', value: 'garbage' }), s);
    const replay = createPuzzle(kind).restart(s, true);
    assert.deepEqual(replay.content, s.content);
    assert.equal(replay.correct, 0);
  });
}
void test('difficulty bands match boundary sizes and timings', () => {
  assert.equal(getDifficultyConfig('tiles', 3).grid, 3);
  assert.equal(getDifficultyConfig('tiles', 4).grid, 4);
  assert.equal(getDifficultyConfig('tiles', 10).grid, 5);
  assert.equal(getDifficultyConfig('tiles', 16).grid, 6);
  assert.equal(getDifficultyConfig('tiles', 20).previewMs, 1500);
  assert.equal(getDifficultyConfig('rhythm', 9).inputCount, 2);
  assert.equal(getDifficultyConfig('rhythm', 10).inputCount, 3);
  assert.equal(getDifficultyConfig('rhythm', 16).inputCount, 4);
  assert.equal(getDifficultyConfig('rhythm', 20).beatMs, 500);
  assert.equal(getDifficultyConfig('sorting', 6).categoryCount, 2);
  assert.equal(getDifficultyConfig('sorting', 7).categoryCount, 3);
  assert.equal(getDifficultyConfig('sorting', 10).itemCount, 12);
});
void test('tiles: preview ignores answers, duplicates are inert, three misses fail', () => {
  let s = start('tiles', 1, 1);
  assert.equal(input(s, { type: 'answer', value: 0 }), s);
  s = input(s, { type: 'ready' });
  if (s.content.kind !== 'tiles') throw Error();
  const p = s.content;
  s = input(s, { type: 'answer', value: p.highlighted[0] });
  assert.equal(input(s, { type: 'answer', value: p.highlighted[0] }), s);
  assert.equal(input(s, { type: 'answer', value: -1 }), s);
  const wrong = Array.from({ length: 9 }, (_, i) => i).filter(
    (i) => !p.highlighted.includes(i),
  );
  for (const v of wrong.slice(0, 3)) s = input(s, { type: 'answer', value: v });
  assert.equal(s.status, 'failure');
  assert.equal(s.mistakes, 3);
});
void test('words: validation uses displayed history, including incorrectly answered words', () => {
  let s = start('words', 1, 1);
  if (s.content.kind !== 'words') throw Error();
  s = {
    ...s,
    content: { kind: 'words', sequence: ['Apple', 'Pear', 'Apple'] },
  };
  s = input(s, { type: 'answer', value: 'SEEN' });
  assert.equal(s.mistakes, 1);
  s = input(s, { type: 'answer', value: 'NEW' });
  s = input(s, { type: 'answer', value: 'SEEN' });
  assert.equal(s.correct, 2);
  assert.equal(s.status, 'success');
  let fail = start('words', 1, 2);
  for (let i = 0; i < 3; i++) {
    if (fail.content.kind !== 'words') throw Error();
    fail = input(fail, {
      type: 'answer',
      value: fail.shown.includes(fail.content.sequence[fail.cursor])
        ? 'NEW'
        : 'SEEN',
    });
  }
  assert.equal(fail.status, 'failure');
});
void test('rhythm: default waits for full sequence before failure; invalid input ignored', () => {
  let s = input(start('rhythm', 20, 4), { type: 'ready' });
  if (s.content.kind !== 'rhythm') throw Error();
  const p = s.content;
  assert.equal(input(s, { type: 'answer', value: 'INVALID' }), s);
  s = input(s, {
    type: 'answer',
    value: p.inputs.find((v) => v !== p.sequence[0])!,
  });
  assert.equal(s.status, 'playing');
  for (const v of p.sequence.slice(1))
    s = input(s, { type: 'answer', value: v });
  assert.equal(s.status, 'failure');
});
void test('sorting: mistakes retain item; third mistake fails', () => {
  let s = start('sorting', 10, 5);
  if (s.content.kind !== 'sorting') throw Error();
  const p = s.content;
  const wrong = p.categories.find((id) => id !== p.items[0].category)!;
  for (let i = 0; i < 3; i++) s = input(s, { type: 'answer', value: wrong });
  assert.equal(s.cursor, 0);
  assert.equal(s.status, 'failure');
});
void test('odd and pattern: wrong choices fail', () => {
  for (const kind of ['odd', 'pattern'] as const) {
    const s = start(kind, 5, 6);
    if (s.content.kind !== kind) throw Error();
    const p = s.content as Extract<
      typeof s.content,
      { kind: 'odd' | 'pattern' }
    >;
    assert.equal(
      input(s, {
        type: 'answer',
        value: p.options.find((x) => x !== p.answer)!,
      }).status,
      'failure',
    );
  }
});
void test('pattern rules independently reproduce all terms and expected answers', () => {
  const families = new Set<string>();
  for (let level = 1; level <= 10; level++)
    for (let seed = 0; seed < 100; seed++) {
      const p = generatePuzzle('pattern', level, seed);
      if (p.kind !== 'pattern') throw Error();
      families.add(p.family);
      const n = p.terms.map(Number),
        differences = n.slice(1).map((v, i) => v - n[i]);
      if (p.family === 'increase' || p.family === 'decrease')
        assert.ok(differences.every((d) => d === differences[0]));
      if (p.family === 'multiply')
        assert.ok(n.slice(1).every((v, i) => v / n[i] === n[1] / n[0]));
      if (p.family === 'differences')
        assert.ok(
          differences.slice(1).every((d, i) => d === differences[i] + 1),
        );
      if (p.family === 'alternate')
        assert.ok(
          n.slice(1).every((v, i) => v === (i % 2 ? n[i] - 1 : n[i] * 2)),
        );
      if (p.family === 'interleave')
        assert.ok(n.slice(2).every((v, i) => v - n[i] === n[2] - n[0]));
      if (p.family === 'alphabet') {
        const codes = p.terms.map((x) => x.charCodeAt(0));
        assert.ok(
          codes.slice(1).every((v, i) => v - codes[i] === codes[1] - codes[0]),
        );
      }
      if (['repeat', 'groups', 'mixed'].includes(p.family)) {
        const period =
          p.family === 'repeat'
            ? 2
            : p.family === 'mixed' || level >= 5
              ? 4
              : 3;
        assert.ok(p.terms.every((v, i) => v === p.terms[i % period]));
      }
    }
  assert.equal(families.size, 10);
});
void test('invalid duplicate, out-of-range, ambiguous and unbalanced content is rejected', () => {
  const tiles = generatePuzzle('tiles', 1, 1);
  if (tiles.kind === 'tiles')
    assert.equal(validatePuzzle({ ...tiles, highlighted: [-1, -1] }, 1), false);
  const odd = generatePuzzle('odd', 1, 1);
  if (odd.kind === 'odd')
    assert.equal(
      validatePuzzle({ ...odd, answer: getCategory(odd.category).words[0] }, 1),
      false,
    );
  const sorting = generatePuzzle('sorting', 10, 1);
  if (sorting.kind === 'sorting')
    assert.equal(
      validatePuzzle(
        { ...sorting, items: sorting.items.map(() => sorting.items[0]) },
        10,
      ),
      false,
    );
  const pattern = generatePuzzle('pattern', 1, 1);
  if (pattern.kind === 'pattern')
    assert.equal(
      validatePuzzle(
        {
          ...pattern,
          options: [
            pattern.answer,
            pattern.answer,
            pattern.answer,
            pattern.answer,
          ],
        },
        1,
      ),
      false,
    );
  assert.equal(
    validatePuzzle({ kind: 'words', sequence: Array(20).fill('Apple') }, 1),
    false,
  );
});
void test('impossible word configuration fails after bounded generation attempts', () => {
  const previous = settings.wordRounds;
  try {
    settings.wordRounds = 1;
    assert.throws(() => generatePuzzle('words', 1, 4), /after 20 attempts/);
  } finally {
    settings.wordRounds = previous;
  }
});
