import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  newPlayer,
  type Game,
  type Command,
} from '../lib/game/types.ts';
import { execute, beginNight, tasks, snapshot } from '../lib/game/engine.ts';
import { savedGame } from '../lib/game/saved-state.ts';
import {
  DEFAULT_CONFIG,
  type Pattern,
  type BoardState,
  type LabState,
  type GridState,
  type RitualState,
} from '../lib/rite/types.ts';
import {
  planVigils,
  validatePlans,
  configureRite,
  riteAction,
  riteReady,
  resolveRite,
  tickRite,
} from '../lib/rite/engine.ts';
import {
  generateBoard,
  solveBoard,
  slide,
  boardSolved,
  boardMoves,
  BOARD_PAR,
} from '../lib/rite/board.ts';
import {
  generateLab,
  solveLab,
  pour,
  labSolved,
  LAB_PAR,
} from '../lib/rite/lab.ts';
import {
  generateGrid,
  solveGrid,
  clueHolds,
  makeRiddle,
  CLUES_PER_PLAYER,
} from '../lib/rite/grid.ts';
import {
  generateRitual,
  CONTROL_COUNTS,
  validOmen,
} from '../lib/rite/ritual.ts';
import { riteView } from '../lib/rite/view.ts';
import { nightChoiceDeadlineFor } from '../lib/game/hms.ts';
const host = { id: 'host', host: true };
function game(kind: Pattern = 'grid', n = 6) {
  const g = newGame('RITE', 'Host');
  g.gameStartedAt = 1;
  g.players = Array.from({ length: n }, (_, i) => ({
    ...newPlayer(`Player ${i}`, i + 1),
    id: `p${i}`,
    role: i === n - 1 ? 'monster' : 'vigilante',
    shown: i === n - 1 ? 'monster' : 'vigilante',
  }));
  configureRite(g, {
    action: 'configureRite',
    config: { ...DEFAULT_CONFIG, patterns: [kind] },
  });
  // Explicit certified fixtures isolate the turn machine from asynchronous preparation.
  if (kind === 'board' || kind === 'lab') {
    g.rite!.prepared = Object.fromEntries(
      g.rite!.plans.map((p) => [
        `${p.id}:${p.kind}:${p.members.length}`,
        kind === 'board'
          ? generateBoard(`test-${p.id}`, p.members.length)
          : generateLab(`test-${p.id}`, p.members.length),
      ]),
    );
  }
  beginNight(g, 100);
  beginNight(g, 200);
  return g;
}
const as = (id: string) => ({ id, host: false });
function action(g: Game, id: string, c: Command, now = 200) {
  return riteAction(
    g,
    as(id),
    { epoch: g.rite!.epoch, night: g.night, ...c },
    now,
  );
}
function memberView(g: Game, id: string, now: number) {
  const v = riteView(g, as(id), now);
  assert.ok(v && !v.host && v.puzzle);
  return v;
}

void test('uniform seeded planner balances every supported table, validates manual teams and handles ritual-only counts', () => {
  for (let n = 5; n <= 18; n++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`),
      plans = planVigils(ids, DEFAULT_CONFIG.patterns, 'planner');
    validatePlans(plans, ids, DEFAULT_CONFIG);
    assert.deepEqual(
      plans,
      planVigils(ids, DEFAULT_CONFIG.patterns, 'planner'),
    );
    assert.equal(new Set(plans.flatMap((p) => p.members)).size, n);
    assert.ok(
      plans.every(
        (p) =>
          p.members.length >= 2 &&
          p.members.length <= 4 &&
          (p.kind !== 'ritual' || p.members.length === 3),
      ),
    );
    if (n % 3 === 0)
      assert.ok(
        planVigils(ids, ['ritual'], 'x').every((p) => p.members.length === 3),
      );
    else
      assert.throws(
        () => planVigils(ids, ['ritual'], 'x'),
        /divisible by three/,
      );
  }
  const plans = planVigils(['a', 'b', 'c', 'd', 'e', 'f'], ['grid'], 'x');
  assert.throws(
    () =>
      validatePlans(
        [{ ...plans[0], members: ['a', 'a', 'a'] }, plans[1]],
        ['a', 'b', 'c', 'd', 'e', 'f'],
        DEFAULT_CONFIG,
      ),
    /exactly one/,
  );
  const all = Array.from({ length: 10 }, (_, i) => `p${i}`);
  let together = false;
  for (let seed = 0; seed < 50; seed++)
    if (
      planVigils(all, ['grid'], `${seed}`).some(
        (p) =>
          p.members.includes('p0') &&
          p.members.includes('p1') &&
          p.members.includes('p2'),
      )
    )
      together = true;
  assert.ok(
    together,
    'No alignment cap prevents three Evil members sharing a vigil.',
  );
});
void test('Sphinx riddles: four clues each, unique hard solutions, varied patterns, determinism and covered forgeries', () => {
  const patterns = new Set<string>();
  for (const n of [2, 3, 4])
    for (let i = 0; i < 6; i++) {
      const members = Array.from({ length: n }, (_, i) => `p${i}`),
        s = generateGrid(`grid-${i}`, members, ['p0'], 2);
      const trueClues = s.clues.filter((c) => !c.forged);
      assert.equal(trueClues.length, n * CLUES_PER_PLAYER);
      assert.equal(new Set(s.clues.map((c) => c.text)).size, s.clues.length);
      assert.deepEqual(solveGrid(trueClues), [s.solution]);
      for (const c of trueClues) {
        assert.ok(clueHolds(s.solution, c));
        assert.match(c.text, /^[A-Z].*[.]$/);
        patterns.add(c.pattern!);
      }
      // At most one plain "X was Y" statement in a hard riddle.
      assert.ok(trueClues.filter((c) => c.pattern === 'direct').length <= 1);
      for (const id of members) {
        const own = trueClues.filter((c) => c.holder === id);
        assert.equal(own.length, CLUES_PER_PLAYER);
        assert.deepEqual(
          own.map((c) => c.revealNight).sort((a, b) => a - b),
          [2, 2, 3, 4],
        );
      }
      assert.ok(
        s.clues
          .filter((c) => c.forged)
          .every((c) => c.holder === 'p0' && !clueHolds(s.solution, c)),
      );
      assert.deepEqual(s, generateGrid(`grid-${i}`, members, ['p0'], 2));
    }
  for (const p of [
    'negative',
    'either-or',
    'neither-nor',
    'exclusive-pairing',
    'compound',
    'relational',
    'cross-category',
    'one-of-three',
    'three-way',
    'set-membership',
  ])
    assert.ok(patterns.has(p), `missing clue pattern ${p}`);
});
void test('Sphinx riddles are hard: a one-clue-at-a-time solver needs several rounds', () => {
  let hard = 0;
  for (let i = 0; i < 8; i++) {
    const r = makeRiddle(`hard-${i}`, 12);
    assert.ok(r.difficulty.stalled || r.difficulty.rounds >= 2);
    if (r.difficulty.stalled || r.difficulty.rounds >= 3) hard++;
  }
  assert.ok(hard >= 6);
});
void test('Legacy single-fact Sphinx clues still evaluate', () => {
  const solution = [0, 1, 2, 3, 4].map((i) => ({
    character: i,
    location: i,
    activity: i,
  }));
  assert.ok(
    clueHolds(solution, {
      facts: [{ a: 'character', x: 1, b: 'location', ys: [1] }],
    }),
  );
});
void test('Escape and Laboratory certify exact hard optimal par (28-32), legal witnesses, distinct layouts and deterministic seeds', () => {
  for (const n of [2, 3, 4])
    for (let i = 0; i < 4; i++) {
      const b = generateBoard(`generator-${i}`, n),
        solution = solveBoard(b.blocks);
      assert.ok(solution);
      // Hard for every vigil size: 28-32 optimal slides.
      assert.equal(solution.length, b.par);
      assert.ok(b.par >= BOARD_PAR[0] && b.par <= BOARD_PAR[1]);
      let blocks = b.blocks;
      for (const m of solution) {
        const next = slide(blocks, m);
        assert.ok(next);
        blocks = next;
      }
      assert.ok(boardSolved(blocks));
      assert.deepEqual(b, generateBoard(`generator-${i}`, n));
      const l = generateLab(`generator-${i}`, n),
        pours = solveLab(l.vials);
      assert.ok(pours);
      assert.equal(pours.length, l.par);
      assert.ok(l.par >= LAB_PAR[0] && l.par <= LAB_PAR[1]);
      let vials = l.vials;
      for (const m of pours) {
        const next = pour(vials, m);
        assert.ok(next);
        vials = next;
      }
      assert.ok(labSolved(vials));
      assert.deepEqual(l, generateLab(`generator-${i}`, n));
    }
  assert.notDeepEqual(
    generateBoard('different-a', 2).blocks,
    generateBoard('different-b', 2).blocks,
  );
  assert.notDeepEqual(
    generateLab('different-a', 2).vials,
    generateLab('different-b', 2).vials,
  );
});
void test('resumable preparation persists across saves and supplies a certified puzzle before opening', () => {
  let g = newGame('PREP', 'Host');
  g.players = Array.from({ length: 6 }, (_, i) => ({
    ...newPlayer(`P${i}`, i + 1),
    id: `p${i}`,
  }));
  configureRite(g, {
    action: 'configureRite',
    config: { ...DEFAULT_CONFIG, patterns: ['board'] },
  });
  for (
    let i = 0;
    i < 300 && Object.keys(g.rite!.prepared ?? {}).length < 2;
    i++
  ) {
    tickRite(g, 0);
    g = savedGame(JSON.stringify(g));
  }
  assert.equal(Object.keys(g.rite!.prepared ?? {}).length, 2);
  beginNight(g, 100);
  beginNight(g, 200);
  assert.equal(g.rite!.squads.length, 2);
});
void test('Ritual generators have globally unique sets, cyclic roles, correct decoding and legal wrong decoys', () => {
  for (let i = 0; i < 40; i++) {
    const s = generateRitual(`ritual-${i}`, ['a', 'b', 'c'], ['b']);
    assert.equal(s.book.flatMap((p) => p.entries).length, 28);
    // Never two look-alike symbols (e.g. skull + skull and crossbones) in one omen.
    assert.ok(
      s.book.every((p) => p.entries.every((e) => validOmen(e.symbols))),
    );
    assert.equal(
      new Set(s.book.flatMap((p) => p.entries.map((e) => e.symbols.join(','))))
        .size,
      28,
    );
    for (const ritual of Object.values(s.rituals)) {
      assert.equal(
        new Set([ritual.performer, ritual.omensHolder, ritual.keeper]).size,
        3,
      );
      assert.equal(ritual.controls.length, 3);
      for (const set of ritual.omens) {
        const p = s.book.find((p) =>
          p.entries.some((e) => e.symbols.join(',') === set.join(',')),
        )!;
        const e = p.entries.find((e) => e.symbols.join(',') === set.join(','))!;
        assert.ok(
          ritual.target.some(
            (t) => t.control === p.control && t.value === e.value,
          ),
        );
      }
      if (ritual.decoys) {
        assert.equal(ritual.omensHolder, 'b');
        for (const set of ritual.decoys) {
          const p = s.book.find((p) =>
            p.entries.some((e) => e.symbols.join(',') === set.join(',')),
          )!;
          const e = p.entries.find(
            (e) => e.symbols.join(',') === set.join(','),
          )!;
          assert.ok(
            ritual.target.some(
              (t) => t.control === p.control && t.value !== e.value,
            ),
          );
        }
      }
    }
    assert.deepEqual(s, generateRitual(`ritual-${i}`, ['a', 'b', 'c'], ['b']));
  }
});
void test('night-2 Rite opens immediately, leaves night choices independent and keeps hidden clues off the wire', () => {
  const g = game(),
    r = g.rite!,
    s = r.squads[0],
    id = s.members[0],
    state = s.state as GridState;
  assert.equal(r.lockUntil, undefined);
  assert.equal(r.windowEnd, undefined);
  assert.ok(g.nightChoiceDeadline! > 200);
  const v = memberView(g, id, 201);
  assert.equal(v.puzzle!.phase, 'turn');
  for (const c of v.puzzle!.clues!.filter((c) => c.hidden)) {
    assert.equal(c.text, undefined);
    assert.equal(Object.hasOwn(c, 'text'), false);
  }
  const hidden = state.clues.filter(
    (c) => c.holder === id && c.revealNight > 2,
  );
  for (const c of hidden) assert.ok(!JSON.stringify(v).includes(c.text));
  assert.equal(
    action(g, id, { action: 'riteGridSubmit', solution: state.solution }),
    'Your submission was recorded.',
  );
  assert.equal(riteReady(g, 201), true);
});
void test('submissions are private, replaceable, majority checked at dawn, and never announce failure', () => {
  const g = game(),
    r = g.rite!,
    s = r.squads[0],
    state = s.state as GridState;
  const wrong = structuredClone(state.solution);
  [wrong[0].activity, wrong[1].activity] = [
    wrong[1].activity,
    wrong[0].activity,
  ];
  action(g, s.members[0], { action: 'riteGridSubmit', solution: wrong });
  action(g, s.members[0], {
    action: 'riteGridSubmit',
    solution: state.solution,
  });
  assert.equal(memberView(g, s.members[1], 200).puzzle!.submission!.length, 0);
  resolveRite(g, 300);
  assert.equal(s.completeNight, undefined);
  assert.equal(g.messages.filter((m) => m.text.includes('vigil')).length, 0);
  beginNight(g, 100000);
  action(g, s.members[1], {
    action: 'riteGridSubmit',
    solution: state.solution,
  });
  resolveRite(g, 300);
  assert.equal(s.completeNight, 3);
  assert.equal(r.status, 'complete');
  assert.equal(
    g.messages.filter((m) => m.text.includes('vigil')).length,
    s.members.length,
  );
});
void test('Escape hands off on each move, cycles turns until manual close and keeps snapshots private', () => {
  const g = game('board'),
    r = g.rite!,
    s = r.squads[0],
    state = s.state as BoardState,
    t = state.turn!;
  const first = t.order[0],
    second = t.order[1];
  g.players.find((p) => p.id === first)!.alive = false;
  const start = memberView(g, first, 200);
  assert.equal(start.puzzle!.phase, 'turn');
  assert.equal(start.puzzle!.deadline, undefined);
  assert.ok(!JSON.stringify(start).includes('order'));
  assert.ok(!JSON.stringify(start).includes('par'));
  const move = boardMoves(state.blocks)[0].move;
  assert.throws(
    () =>
      action(g, second, { action: 'riteBoardMove', ...move, turn: t.token }),
    /could not be completed/,
  );
  const token = t.token;
  action(g, first, { action: 'riteBoardMove', ...move, turn: token }, 201);
  assert.equal(t.cursor, 1);
  assert.equal(memberView(g, first, t.start).puzzle!.phase, 'wait');
  assert.throws(
    () =>
      action(
        g,
        first,
        { action: 'riteBoardMove', ...move, turn: token },
        t.start,
      ),
    /could not be completed/,
  );
  assert.equal(memberView(g, second, t.start).puzzle!.phase, 'turn');
  const frozen = memberView(g, first, t.start).puzzle!.blocks;
  const next = boardMoves(state.blocks)[0].move;
  action(
    g,
    second,
    { action: 'riteBoardMove', ...next, turn: t.token },
    t.start,
  );
  assert.deepEqual(memberView(g, first, t.start).puzzle!.blocks, frozen);
  assert.equal(t.cursor, 2);
  const third = t.order[2];
  assert.equal(memberView(g, third, t.start).puzzle!.phase, 'turn');
  action(g, third, { action: 'ritePass', turn: t.token }, t.start);
  assert.equal(t.cursor, 0);
  assert.equal(memberView(g, first, t.start).puzzle!.phase, 'turn');
  assert.equal(riteReady(g, 100002), true);
  assert.equal(memberView(g, first, 100002).puzzle!.phase, 'turn');
  riteAction(g, host, { action: 'riteForce' }, 100003);
  assert.equal(memberView(g, first, 100003).puzzle!.phase, 'locked');
  assert.throws(
    () => action(g, first, { action: 'ritePass', turn: t.token }, 100003),
    /could not be completed/,
  );
  const saved = structuredClone(state.blocks);
  beginNight(g, 120000);
  assert.deepEqual(state.blocks, saved);
});
void test('Escape rejects illegal slides but never advances a turn because time passed', () => {
  const g = game('board'),
    s = g.rite!.squads[0],
    state = s.state as BoardState,
    t = state.turn!,
    id = t.order[0],
    before = structuredClone(state.blocks),
    b = state.blocks[0];
  for (const m of [
    { block: b.id, x: -1, y: b.y },
    { block: b.id, x: b.x, y: b.y + 1 },
    { block: b.id, x: b.x, y: b.y },
    { block: 'unknown', x: 0, y: 0 },
  ]) {
    assert.throws(
      () => action(g, id, { action: 'riteBoardMove', turn: t.token, ...m }),
      /could not be completed/,
    );
    assert.deepEqual(state.blocks, before);
  }
  tickRite(g, 1000000);
  assert.equal(t.cursor, 0);
  assert.equal(t.log.length, 0);
  action(g, id, { action: 'ritePass', turn: t.token }, 1000000);
  assert.equal(t.cursor, 1);
});
void test('an active timed Rite migrates to open play without losing its board or turn', () => {
  const g = game('board'),
    r = g.rite!,
    state = r.squads[0].state as BoardState;
  r.timerless = undefined;
  r.lockUntil = 300;
  r.windowEnd = 500;
  state.turn!.deadline = 350;
  const token = state.turn!.token,
    board = structuredClone(state.blocks);
  assert.equal(tickRite(g, 1000), true);
  assert.equal(r.timerless, true);
  assert.equal(r.lockUntil, undefined);
  assert.equal(r.windowEnd, undefined);
  assert.equal(state.turn!.token, token);
  assert.equal(state.turn!.cursor, 0);
  assert.deepEqual(state.blocks, board);
  assert.equal(memberView(g, state.turn!.order[0], 1000).puzzle!.phase, 'turn');
});
void test('Storyteller can pass an absent player’s Rite turn without a timer', () => {
  const g = game('board'),
    squad = g.rite!.squads[0];
  const turn = (squad.state as BoardState).turn!;
  const first = turn.order[0];
  assert.equal(
    riteAction(g, host, { action: 'ritePassTurn', squad: squad.id }, 500000),
    'The Storyteller passed this vigil’s turn.',
  );
  assert.equal(turn.cursor, 1);
  assert.equal(memberView(g, first, 500000).puzzle!.phase, 'wait');
  assert.equal(memberView(g, turn.order[1], 500000).puzzle!.phase, 'turn');
});
void test('Lab rules pour maximal top run, reject unlike liquid, detect dead ends and treat solver caps as unknown', () => {
  const v = [
    { id: 'a', shape: 0, layers: [0, 1, 1] },
    { id: 'b', shape: 0, layers: [1, 1, 1] },
    { id: 'c', shape: 0, layers: [] },
  ];
  assert.deepEqual(
    pour(v, { from: 'a', to: 'b' })?.map((v) => v.layers),
    [[0, 1], [1, 1, 1, 1], []],
  );
  assert.equal(pour(v, { from: 'a', to: 'a' }), null);
  assert.equal(
    pour(
      [
        { id: 'a', shape: 0, layers: [0, 1] },
        { id: 'b', shape: 0, layers: [1, 0] },
      ],
      { from: 'a', to: 'b' },
    ),
    null,
  );
  assert.equal(
    solveLab([
      { id: 'a', shape: 0, layers: [0, 1] },
      { id: 'b', shape: 0, layers: [1, 0] },
    ]),
    null,
  );
  assert.equal(solveLab(generateLab('cap', 2).vials, 0), undefined);
});
void test('Lab unanimous votes remain open without deadlines and preserve tonight-only undo', () => {
  const g = game('lab'),
    r = g.rite!,
    s = r.squads[0],
    state = s.state as LabState,
    t = state.turn!;
  const p = t.order[0],
    move = solveLab(state.vials)![0],
    before = structuredClone(state.vials);
  action(g, p, { action: 'riteLabPour', ...move, turn: t.token });
  const afterFirst = structuredClone(state.vials);
  const nextPour = solveLab(state.vials)![0];
  action(g, p, { action: 'riteLabPour', ...nextPour, turn: t.token });
  assert.notDeepEqual(state.vials, afterFirst);
  assert.equal(t.cursor, 0);
  assert.equal(memberView(g, p, t.start).puzzle!.phase, 'turn');
  const caller = p;
  action(
    g,
    caller,
    { action: 'riteLabCall', kind: 'reset', turn: t.token },
    t.start,
  );
  const vote = t.vote!,
    voters = s.members.filter((id) => id !== caller);
  assert.ok(
    !JSON.stringify(memberView(g, voters[0], t.start)).includes('ballots'),
  );
  action(
    g,
    voters[0],
    { action: 'riteLabBallot', vote: vote.id, yes: true },
    t.start,
  );
  assert.equal(t.cursor, 0);
  assert.throws(
    () =>
      action(
        g,
        voters[0],
        { action: 'riteLabBallot', vote: vote.id, yes: true },
        t.start,
      ),
    /could not be completed/,
  );
  action(
    g,
    voters[1],
    { action: 'riteLabBallot', vote: vote.id, yes: true },
    t.start,
  );
  assert.equal(t.cursor, 1);
  assert.equal(t.voteResult!.passed, true);
  assert.deepEqual(state.vials, before);
  assert.throws(
    () =>
      action(
        g,
        t.order[1],
        { action: 'riteLabCall', kind: 'undo', turn: t.token },
        t.start,
      ),
    /could not be completed/,
  );
  action(
    g,
    t.order[1],
    { action: 'riteLabCall', kind: 'reset', turn: t.token },
    t.start,
  );
  tickRite(g, 1000000);
  assert.ok(t.vote);
  action(
    g,
    s.members.find((id) => id !== t.order[1])!,
    { action: 'riteLabBallot', vote: t.vote!.id, yes: false },
    1000000,
  );
  const remaining = s.members.find(
    (id) => id !== t.order[1] && !Object.hasOwn(t.vote!.ballots, id),
  );
  if (remaining)
    action(
      g,
      remaining,
      { action: 'riteLabBallot', vote: t.vote!.id, yes: true },
      1000001,
    );
  assert.equal(t.voteResult!.passed, false);
  assert.equal(t.cursor, 2 % t.order.length);
  assert.equal(memberView(g, t.order[t.cursor], 1000002).puzzle!.phase, 'turn');
  action(g, t.order[t.cursor], { action: 'ritePass', turn: t.token }, 1000002);
  assert.equal(t.cursor, 0);
  assert.equal(memberView(g, p, 1000002).puzzle!.phase, 'turn');
  assert.equal(riteReady(g, 1000002), true);
  riteAction(g, host, { action: 'riteForce' }, 1000003);
  assert.equal(memberView(g, p, 1000003).puzzle!.phase, 'locked');
});
void test('Ritual first-night restriction, one attempt, own result only, persistent success and two-of-three completion', () => {
  const g = game('ritual'),
    r = g.rite!,
    s = r.squads[0],
    state = s.state as RitualState,
    id = s.members[0],
    ritual = state.rituals[id];
  assert.throws(
    () => action(g, id, { action: 'riteRitualPerform', altar: ritual.target }),
    /could not be completed/,
  );
  beginNight(g, 100000);
  assert.equal(
    action(g, id, { action: 'riteRitualPerform', altar: ritual.target }),
    'The ritual is performed.',
  );
  assert.throws(
    () => action(g, id, { action: 'riteRitualPerform', altar: ritual.target }),
    /could not be completed/,
  );
  const other = s.members[1];
  assert.equal(memberView(g, other, 200).puzzle!.performed, false);
  assert.equal(memberView(g, other, 200).puzzle!.result, undefined);
  const wrong = structuredClone(state.rituals[other].target);
  wrong[0].value = (wrong[0].value + 1) % CONTROL_COUNTS[wrong[0].control];
  assert.equal(
    action(g, other, { action: 'riteRitualPerform', altar: wrong }),
    'The ritual falters',
  );
  resolveRite(g, 300);
  assert.equal(s.completeNight, undefined);
  beginNight(g, 220000);
  action(g, other, {
    action: 'riteRitualPerform',
    altar: state.rituals[other].target,
  });
  resolveRite(g, 300);
  assert.equal(s.completeNight, 4);
  assert.equal(ritual.doneNight, 3);
});
void test('per-actor redaction excludes other vigils, targets, attempt records, private cards, server seeds and solver data', () => {
  for (const kind of ['grid', 'ritual'] as const) {
    const g = game(kind),
      r = g.rite!,
      s = r.squads[0],
      id = s.members[0],
      wire = JSON.stringify(memberView(g, id, 200));
    for (const name of [
      'solution',
      'target',
      'attempts',
      'seed',
      'par',
      'dist',
      'decoys',
      'log',
      'preparing',
      'prepared',
    ])
      assert.ok(!wire.includes(`"${name}"`), name);
    assert.ok(!wire.includes(r.squads[1].id));
    assert.equal(riteView(g, as('outsider'), 200), null);
    assert.ok(riteView(g, host, 200)?.host);
  }
});
void test('reward refreshes all alignments once, respects death restrictions and preserves targets, links and death-trigger state', () => {
  const g = game(),
    r = g.rite!,
    s = r.squads[0],
    state = s.state as GridState;
  const roles = [
    'vigilante',
    'mortician',
    'researcher',
    'executioner',
    'guardian',
    'monster',
  ];
  g.players.forEach((p, i) => {
    p.role = p.shown = roles[i];
    p.used = true;
    p.charge = 'p0';
    p.revived = true;
  });
  g.players[0].alive = false;
  g.hms!.nightmare = { player: 'p1', bound: 'p0', used: true };
  g.hms!.constellation = {
    owner: 'p2',
    members: ['p0', 'p1', 'p2'],
    linked: false,
  };
  g.hms!.stUsed = true;
  s.members
    .slice(0, 2)
    .forEach((id) =>
      action(g, id, { action: 'riteGridSubmit', solution: state.solution }),
    );
  resolveRite(g, 300);
  assert.ok(g.players.every((p) => !p.used && p.charge === 'p0' && p.revived));
  assert.equal(g.players[0].alive, false);
  assert.equal(g.hms!.nightmare.used, false);
  assert.equal(g.hms!.nightmare.bound, 'p0');
  assert.equal(g.hms!.constellation.linked, false);
  assert.equal(g.hms!.stUsed, false);
  const count = g.log.filter((l) => l.text === 'The Rite is complete.').length;
  resolveRite(g, 301);
  assert.equal(
    g.log.filter((l) => l.text === 'The Rite is complete.').length,
    count,
  );
});
void test('both scripts queue refreshed first-night information only on the next night, with usual actor eligibility', () => {
  for (const [script, roles] of [
    [
      'horrors',
      [
        'sheriff',
        'hoflibrarian',
        'teacher',
        'vigilante',
        'researcher',
        'monster',
      ],
    ],
    [
      'holyMoonStars',
      [
        'astrologist',
        'mystic',
        'astronaut',
        'stargazer',
        'prophet',
        'necromancer',
      ],
    ],
  ] as const) {
    const g = game(),
      r = g.rite!,
      s = r.squads[0],
      state = s.state as GridState;
    g.script = script;
    g.players.forEach((p, i) => {
      p.role = p.shown = roles[i];
    });
    s.members
      .slice(0, 2)
      .forEach((id) =>
        action(g, id, { action: 'riteGridSubmit', solution: state.solution }),
      );
    resolveRite(g, 300);
    beginNight(g, 100000);
    const types = tasks(g).map((t) => t.role);
    for (const role of roles.slice(0, script === 'horrors' ? 3 : 5))
      assert.ok(types.includes(role), role);
    beginNight(g, 210000);
    for (const role of roles.slice(0, script === 'horrors' ? 3 : 5))
      assert.ok(!tasks(g).some((t) => t.role === role), role);
  }
});
void test('save compatibility, disabled older tables, setup authorization, force controls and rewind invalidate stale requests', () => {
  const original = newGame('OLD', 'Host');
  assert.equal(savedGame(JSON.stringify(original)).rite, undefined);
  const lobby = newGame('UNDO', 'Host');
  execute(
    lobby,
    host,
    { action: 'configureRite', config: { ...DEFAULT_CONFIG, enabled: false } },
    1,
  );
  assert.ok(lobby.rite);
  execute(lobby, host, { action: 'undo' }, 2);
  assert.equal(lobby.rite, undefined);
  const g = game(),
    r = g.rite!;
  assert.deepEqual(
    savedGame(JSON.stringify(g)).rite,
    JSON.parse(JSON.stringify(r)),
  );
  assert.throws(
    () =>
      execute(
        g,
        as('p0'),
        { action: 'configureRite', config: DEFAULT_CONFIG },
        200,
      ),
    /Storyteller/,
  );
  assert.throws(
    () => configureRite(g, { action: 'configureRite', config: DEFAULT_CONFIG }),
    /before it opens/,
  );
  assert.throws(
    () => riteAction(g, as('p0'), { action: 'riteForce' }, 200),
    /Storyteller/,
  );
  snapshot(g, 'Rite reward', 300);
  riteAction(g, host, { action: 'riteForce' }, 400);
  assert.equal(r.status, 'open');
  assert.equal(riteReady(g, 400), true);
  assert.equal(r.rewardApplied, undefined);
  const epoch = r.epoch;
  execute(g, host, { action: 'undo' }, 500);
  assert.notEqual(g.rite!.epoch, epoch);
  assert.throws(
    () =>
      riteAction(
        g,
        as('p0'),
        {
          action: 'riteGridSubmit',
          epoch,
          night: g.night,
          solution: (g.rite!.squads[0].state as GridState).solution,
        },
        200,
      ),
    /earlier window/,
  );
});

void test('Rite does not shorten independent night choice deadlines', () => {
  const g = game();
  g.nightChoiceDeadlines = { redirect: 60200 };
  assert.equal(nightChoiceDeadlineFor(g, { key: 'redirect' }), 60200);
  g.rite!.status = 'complete';
  assert.equal(nightChoiceDeadlineFor(g, { key: 'redirect' }), 60200);
});

void test('a pending redeal never stalls another vigil, and force close cancels preparation', () => {
  const g = game('board'),
    r = g.rite!,
    first = r.squads[0],
    other = r.squads[1];
  riteAction(g, host, { action: 'riteRedeal', squad: first.id }, 200);
  assert.ok(r.pendingRedeal?.includes(first.id));
  const turn = (other.state as BoardState).turn!;
  tickRite(g, 30200);
  assert.equal(turn.log.length, 0);
  assert.equal(
    memberView(g, turn.order[turn.cursor], 30200).puzzle!.phase,
    'turn',
  );
  riteAction(g, host, { action: 'riteForce' }, 31200);
  assert.deepEqual(r.pendingRedeal, []);
  assert.equal(riteReady(g, 31200), true);
});
