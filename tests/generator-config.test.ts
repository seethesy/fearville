import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  DEFAULT_PRESET,
  PUZZLE_PRESETS,
  GENERATOR_STYLE,
  puzzlePreset,
} from '../lib/rite/generator-config.ts';
import { generateGrid } from '../lib/rite/grid.ts';
import { generateRitual, validAltar } from '../lib/rite/ritual.ts';
import { boardCandidate } from '../lib/rite/board.ts';

void test('normal keeps the pre-refactor seeded outputs byte-for-byte', () => {
  const states = [
    generateGrid('config-baseline', ['a', 'b', 'c'], [], 2),
    generateRitual('config-baseline', ['a', 'b', 'c'], []),
    boardCandidate('config-baseline', 3, 0),
  ];
  assert.deepEqual(
    states.map((s) =>
      createHash('sha256').update(JSON.stringify(s)).digest('hex'),
    ),
    [
      'c200c34efc84f1b73a6f4e815166136aae02ed5764c7eb01e181eff490f72e22',
      '480eecf869e56197301ab586779a8c924aa7d9bbdae3261c72b48bee411a6a7d',
      '1ffd70540f991c5e93054f22817bc79fa89d2f24103bd0c1491b1fe0c6c3f71f',
    ],
  );
});
void test('four named presets include impossible; default remains normal', () => {
  assert.equal(DEFAULT_PRESET, 'normal');
  assert.deepEqual(Object.keys(PUZZLE_PRESETS), [
    'easy',
    'normal',
    'hard',
    'impossible',
  ]);
  assert.equal(puzzlePreset('impossible'), 'impossible');
  assert.throws(() => puzzlePreset('toString'));
  assert.equal(GENERATOR_STYLE.timing.turnMilliseconds, 5000);
  assert.deepEqual(PUZZLE_PRESETS.normal.lab, {
    colors: 10,
    empty: 2,
    par: [28, 32],
  });
});
void test('Divination omen count follows the preset and altars validate against their controls', () => {
  for (const preset of ['easy', 'normal', 'hard', 'impossible'] as const) {
    const ritual = generateRitual('presets', ['a', 'b', 'c'], [], preset)
      .rituals.a;
    assert.equal(ritual.omens.length, PUZZLE_PRESETS[preset].ritual.omenCount);
    assert.ok(validAltar(ritual.target, ritual.controls));
    assert.ok(!validAltar(ritual.target.slice(1), ritual.controls));
  }
});
