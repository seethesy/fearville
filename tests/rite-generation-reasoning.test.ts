import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRiddle,
  generateGrid,
  solveGrid,
  clueHolds,
} from '../lib/rite/grid.ts';
import {
  applyRitualRules,
  CONTROL_COUNTS,
  decodeRitual,
  generateRitual,
  ritualRuleText,
  validOmen,
} from '../lib/rite/ritual.ts';
import {
  DEFAULT_CONFIG,
  type Altar,
  type RitualRule,
} from '../lib/rite/types.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { riteView } from '../lib/rite/view.ts';

const levels = ['easy', 'standard', 'hard'] as const;
const ordered = (altar: Altar) =>
  [...altar].sort((a, b) => a.control.localeCompare(b.control));

void test('Sphinx difficulty profiles remain unique, truthful, varied and deterministic at every team size', () => {
  for (const difficulty of levels) {
    const patterns = new Set<string>();
    for (const count of [2, 3, 4]) {
      const members = Array.from({ length: count }, (_, i) => `p${i}`);
      const options = { difficulty, candidateCount: 16 };
      const puzzle = generateGrid(
        `profile-${count}`,
        members,
        ['p0'],
        2,
        1,
        options,
      );
      const clues = puzzle.clues.filter((clue) => !clue.forged);
      assert.deepEqual(solveGrid(clues), [puzzle.solution]);
      assert.equal(clues.length, count * 4);
      assert.equal(
        new Set(puzzle.clues.map((clue) => clue.text)).size,
        puzzle.clues.length,
      );
      for (const clue of clues) {
        assert.ok(clueHolds(puzzle.solution, clue));
        patterns.add(clue.pattern!);
      }
      assert.ok(
        puzzle.clues
          .filter((clue) => clue.forged)
          .every((clue) => !clueHolds(puzzle.solution, clue)),
      );
      assert.deepEqual(
        puzzle,
        generateGrid(`profile-${count}`, members, ['p0'], 2, 1, options),
      );
    }
    assert.ok(
      patterns.size >= 5,
      `${difficulty} needs varied reasoning, even with simple deductions`,
    );
  }
});

void test('Sphinx progression changes measured reasoning, while one simple answer yields distinct riddles', () => {
  const scores = [0, 0, 0];
  const fixed = [0, 1, 2, 3, 4].map((i) => ({
    character: i,
    location: i,
    activity: i,
  }));
  const fingerprints = new Set<string>();
  for (let seed = 0; seed < 5; seed++) {
    for (const [index, difficulty] of levels.entries()) {
      const puzzle = makeRiddle(`progression-${seed}`, 12, fixed, {
        difficulty,
      });
      assert.deepEqual(solveGrid(puzzle.cards), [fixed]);
      scores[index] += puzzle.difficulty.stalled ? 6 : puzzle.difficulty.rounds;
      if (difficulty === 'easy') assert.equal(puzzle.difficulty.stalled, false);
      fingerprints.add(JSON.stringify(puzzle.cards.map((card) => card.logic)));
    }
  }
  assert.ok(scores[0] < scores[1] && scores[1] < scores[2], scores.join(' < '));
  assert.equal(fingerprints.size, 15);
});

void test('Sphinx bounds generator settings and rejects malformed solution requests', () => {
  assert.throws(() => makeRiddle('invalid', 0), /8 and 16/);
  assert.throws(() => makeRiddle('invalid', 8, []), /five distinct/);
  const puzzle = makeRiddle('bounded', 8, undefined, {
    difficulty: 'easy',
    candidateCount: -10,
    targetRounds: Infinity,
  });
  assert.deepEqual(solveGrid(puzzle.cards), [puzzle.solution]);
});

void test('Divination progresses from lookup to chained reasoning with unique readings and distinct seeded puzzles', () => {
  const fingerprints = new Set<string>();
  for (const [index, difficulty] of levels.entries()) {
    for (let seed = 0; seed < 12; seed++) {
      const puzzle = generateRitual(
        `ritual-profile-${seed}`,
        ['a', 'b', 'c'],
        ['b'],
        { difficulty },
      );
      assert.deepEqual(
        puzzle,
        generateRitual(`ritual-profile-${seed}`, ['a', 'b', 'c'], ['b'], {
          difficulty,
        }),
      );
      assert.ok(
        puzzle.book.every((page) =>
          page.entries.every((entry) => validOmen(entry.symbols)),
        ),
      );
      assert.equal(
        new Set(
          puzzle.book.flatMap((page) =>
            page.entries.map((entry) => entry.symbols.join(',')),
          ),
        ).size,
        28,
      );
      for (const ritual of Object.values(puzzle.rituals)) {
        const rules = ritual.rules ?? [];
        assert.equal(rules.length, [0, 1, 3][index]);
        assert.equal(
          rules.filter((rule) => rule.kind === 'link').length,
          index === 2 ? 2 : 0,
        );
        // Symbol order and omen-card order cannot change the solution.
        const decoded = decodeRitual(
          puzzle.book,
          [...ritual.omens].reverse().map((symbols) => [...symbols].reverse()),
          rules,
        );
        assert.ok(decoded);
        assert.deepEqual(ordered(decoded), ordered(ritual.target));
        assert.ok(ritual.target.some((entry) => entry.value !== 0));
        if (ritual.decoys) {
          const decoy = decodeRitual(puzzle.book, ritual.decoys, rules);
          assert.ok(decoy);
          assert.notDeepEqual(ordered(decoy), ordered(ritual.target));
        }
      }
      fingerprints.add(JSON.stringify(puzzle));
    }
  }
  assert.equal(fingerprints.size, 36);
});

void test('Divination rule chains are reversible, explain wraparound, and preserve legacy decoding', () => {
  const rules: RitualRule[] = [
    { control: 'dial', kind: 'shift', amount: -2 },
    { control: 'chalice', kind: 'link', source: 'dial' },
    { control: 'offerings', kind: 'mirror' },
    { control: 'offerings', kind: 'link', source: 'chalice' },
  ];
  const answers = new Set<string>();
  for (let dial = 0; dial < CONTROL_COUNTS.dial; dial++)
    for (let chalice = 0; chalice < CONTROL_COUNTS.chalice; chalice++)
      for (
        let offerings = 0;
        offerings < CONTROL_COUNTS.offerings;
        offerings++
      ) {
        const base: Altar = [
          { control: 'dial', value: dial },
          { control: 'chalice', value: chalice },
          { control: 'offerings', value: offerings },
        ];
        const before = structuredClone(base);
        answers.add(JSON.stringify(applyRitualRules(base, rules)));
        assert.deepEqual(base, before);
      }
  assert.equal(
    answers.size,
    8 * 3 * 6,
    'Every encoded altar must have one distinct final answer',
  );
  assert.match(ritualRuleText(rules[0]), /backward.*wrapping/);
  assert.match(ritualRuleText(rules[1]), /starting at 1.*wrapping/);
  const legacy = generateRitual('legacy', ['a', 'b', 'c'], []);
  for (const ritual of Object.values(legacy.rituals)) {
    assert.equal(ritual.rules, undefined);
    assert.deepEqual(
      ordered(decodeRitual(legacy.book, ritual.omens)!),
      ordered(ritual.target),
    );
  }
  assert.equal(decodeRitual(legacy.book, [[0], [1], [2]]), null);
  const omen = legacy.rituals.a.omens[0];
  assert.equal(decodeRitual(legacy.book, [omen, omen, omen]), null);
});

void test('Divination views expose only the actor’s rule instructions and their kept book instructions', () => {
  const state = generateRitual('view-rules', ['a', 'b', 'c'], [], {
    difficulty: 'hard',
  });
  const game = newGame('RULE', 'Host');
  game.players = ['a', 'b', 'c'].map((id, index) => ({
    ...newPlayer(id, index + 1),
    id,
  }));
  game.rite = {
    config: { ...DEFAULT_CONFIG },
    seed: 'private-seed',
    epoch: 'epoch',
    status: 'open',
    plans: [],
    squads: [{ id: 'squad', kind: 'ritual', members: ['a', 'b', 'c'], state }],
    resolvedNight: 0,
  };
  for (const id of ['a', 'b', 'c']) {
    const view = riteView(game, { id, host: false }, 0);
    assert.ok(view && !view.host && view.puzzle);
    const kept = Object.values(state.rituals).find(
      (ritual) => ritual.keeper === id,
    )!;
    assert.deepEqual(view.puzzle.rules, state.rituals[id].rules);
    assert.deepEqual(view.puzzle.keeperRules, kept.rules);
    for (const key of ['target', 'seed', 'rituals', 'attempts'])
      assert.ok(!JSON.stringify(view).includes(`"${key}"`));
  }
});
