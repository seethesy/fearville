import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  newPlayer,
  HOF_ROLES,
  HMS_ROLES,
  HOF_COUNTS,
  TEAM_ORDER,
  role,
  type Game,
} from '../lib/game/types.ts';
import { execute, tasks, nightChoiceTask } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import { pendingDeath } from '../lib/game/hms.ts';
import { deriveResult } from '../lib/social/derive.ts';
import { ROLE_TIPS, roleTips } from '../lib/game/role-tips.ts';

const host = { id: 'host', host: true };
let clock = 0;
const later = () => (clock += 1000);
const after = (g: Game) =>
  (clock = Math.max(clock, g.nightChoiceDeadline ?? 0) + 1000);

// Seat order follows the role list; seat n is P<n>.
function game(roles: string[], extra: Record<string, unknown> = {}) {
  const g = deal(roles, extra);
  // Keep Guardian wards predictable: the first evil player.
  for (const p of g.players.filter((p) => p.role === 'guardian'))
    p.charge = g.players.find((q) =>
      ['minion', 'demon'].includes(role(q.role)!.team),
    )!.id;
  return g;
}
function deal(roles: string[], extra: Record<string, unknown> = {}) {
  clock = 0;
  const g = newGame('HOF', 'Host');
  g.script = 'horrors';
  g.players = roles.map((r, i) => ({
    ...newPlayer('P' + (i + 1), i + 1),
    role: r,
    shown: r === 'drunk' ? 'doctor' : r,
  }));
  g.bluffs = [];
  execute(g, host, { action: 'start', override: true, ...extra }, later());
  return g;
}
const P = (g: Game, n: number) => g.players[n - 1];
const as = (g: Game, n: number) => ({ id: P(g, n).id, host: false });
const order = (g: Game) =>
  tasks(g).map(
    (t) =>
      t.key.split(':')[0] +
      (t.player ? ':' + g.players.find((p) => p.id === t.player)!.seat : ''),
  );
function choose(g: Game, seat: number, c: Record<string, unknown>) {
  const p = P(g, seat);
  const t = nightChoiceTask(g, p.id);
  assert.ok(t, `seat ${seat} has a night choice`);
  return execute(
    g,
    as(g, seat),
    { action: 'nightChoice', task: t.key, round: t.round, ...c },
    clock,
  );
}
// Confirms the current night task with the form's defaults plus overrides.
function resolve(g: Game, c: Record<string, unknown> = {}) {
  const t = tasks(g).find((t) => !t.done)!;
  assert.ok(t, 'a night task remains');
  const control = view(g, host, 1, clock).controls.find(
    (x) => x.action === 'night',
  )!;
  assert.ok(control, 'a night control is offered');
  const base: Record<string, unknown> = Object.fromEntries(
    control.fields.map((f) => [f.key, f.value ?? '']),
  );
  // Fill targets for players who did not choose, as a Storyteller would.
  const others = g.players.filter((p) => p.alive && p.id !== t.player);
  ['target', 'target2'].forEach((k, i) => {
    if (k in base && !base[k] && !c[k])
      base[k] =
        t.role === 'mortician' ? g.hms!.nightStartDead[0] : others[i].id;
  });
  return execute(
    g,
    host,
    {
      ...base,
      choiceId: g.nightChoices?.[t.key]?.id ?? '',
      ...c,
      action: 'night',
      task: t.key,
    },
    after(g),
  );
}
// Resolves pending deaths with the form's defaults plus overrides.
function settle(g: Game, c: Record<string, unknown> = {}) {
  const out: string[] = [];
  for (let d = pendingDeath(g); d; d = pendingDeath(g)) {
    if (d.bodyguard && d.bodyguard.decision === undefined) {
      execute(
        g,
        as(g, g.players.findIndex((p) => p.id === d.bodyguard!.player) + 1),
        {
          action: c.bodyguardAccept ? 'bodyguardAccept' : 'bodyguardDecline',
          death: d.id,
        },
        later(),
      );
      continue;
    }
    const control = view(g, host, 1, clock).controls.find(
      (x) => x.action === 'resolveDeath',
    )!;
    const base = Object.fromEntries(
      control.fields.map((f) => [f.key, f.value ?? '']),
    );
    out.push(
      execute(
        g,
        host,
        { ...base, ...c, action: 'resolveDeath', death: d.id },
        later(),
      ),
    );
  }
  return out;
}
function runNight(
  g: Game,
  c: Record<string, Record<string, unknown>> = {},
  deaths: Record<string, unknown> = {},
) {
  for (let i = 0; i < 40; i++) {
    settle(g, deaths);
    const t = tasks(g).find((t) => !t.done);
    if (!t) break;
    // Attacks nobody chose are skipped rather than invented.
    if (
      ['monster', 'wraith', 'basilisk', 'mortician', 'doctor'].includes(
        t.role,
      ) &&
      !g.nightChoices?.[t.key] &&
      !c[t.role]
    )
      execute(g, host, { action: 'nightSkip' }, after(g));
    else resolve(g, c[t.role] ?? {});
  }
  settle(g, deaths);
}
function dawn(g: Game) {
  runNight(g);
  execute(g, host, { action: 'dawn' }, later());
}
function toNight(g: Game) {
  g.phase = 'dayReview';
  execute(g, host, { action: 'finishDay' }, later());
}

const NINE = [
  'doctor', // 1
  'watchman', // 2
  'basilisk', // 3
  'monster', // 4
  'detective', // 5
  'judge', // 6
  'drunk', // 7 (shown Doctor)
  'guardian', // 8
  'bodyguard', // 9
];

void test('every Horrors of Fearville role is unique and counts match the script', () => {
  assert.equal(new Set(HOF_ROLES.map((r) => r.id)).size, HOF_ROLES.length);
  assert.equal(role('hoflibrarian')?.name, 'Librarian');
  assert.match(
    role('vigilante')!.description,
    /^Once per game, during the day/,
  );
  for (let n = 5; n <= 18; n++) {
    const c = HOF_COUNTS[n];
    assert.equal(
      c.reduce((a, b) => a + b, 0),
      n,
      `${n} players`,
    );
    TEAM_ORDER.forEach((t, i) =>
      assert.ok(
        HOF_ROLES.filter((r) => r.team === t).length >= c[i],
        `${n} players, ${t}`,
      ),
    );
  }
});

void test('tips cover both scripts and the player receives only their perceived role', () => {
  for (const r of HOF_ROLES) assert.ok(ROLE_TIPS.horrors[r.id]?.length, r.id);
  for (const r of HMS_ROLES)
    assert.ok(ROLE_TIPS.holyMoonStars[r.id]?.length, r.id);
  const g = game(['drunk', 'doctor', 'detective', 'basilisk', 'monster']);
  const shown = view(g, as(g, 1), 1, clock);
  assert.deepEqual(shown.character?.tips, roleTips('horrors', 'doctor'));
  assert.ok(
    !JSON.stringify(shown.character).includes(
      'You see guidance for the Villager',
    ),
  );
  P(g, 1).shown = 'detective';
  assert.deepEqual(
    view(g, as(g, 1), 2, clock).character?.tips,
    roleTips('horrors', 'detective'),
    'tips change with the role the player is told',
  );
});

void test('random assignment deals valid setups for 5–18 players', () => {
  for (let n = 5; n <= 18; n++)
    for (let k = 0; k < 10; k++) {
      const g = newGame('HOF', 'Host');
      g.script = 'horrors';
      g.assignmentSeed = `seed-${n}-${k}`;
      g.players = Array.from({ length: n }, (_, i) =>
        newPlayer('P' + i, i + 1),
      );
      execute(g, host, { action: 'randomAssign' }, 1);
      assert.deepEqual(
        view(g, host, 1, 1).issues,
        [],
        `${n} players, seed ${k}`,
      );
      const counts = TEAM_ORDER.map(
        (t) => g.players.filter((p) => role(p.role)?.team === t).length,
      );
      assert.deepEqual(counts, HOF_COUNTS[n]);
      const start = view(g, host, 1, 1).controls.find(
        (c) => c.action === 'start',
      )!;
      const values = Object.fromEntries(
        start.fields.map((f) => [f.key, f.value]),
      );
      execute(g, host, { ...values, action: 'start' }, 2);
      for (const p of g.players.filter((p) =>
        ['executioner', 'guardian'].includes(p.role),
      )) {
        assert.ok(p.charge && p.charge !== p.id);
        if (p.role === 'executioner')
          assert.notEqual(
            role(P(g, g.players.findIndex((q) => q.id === p.charge) + 1).role)
              ?.team,
            'demon',
          );
      }
    }
});

void test('tables seat up to 18 players in every script', () => {
  for (const script of ['holyMoonStars', 'horrors'] as const) {
    const g = newGame('BIG', 'Host');
    g.script = script;
    g.players = Array.from({ length: 18 }, (_, i) => newPlayer('P' + i, i + 1));
    execute(g, host, { action: 'randomAssign' }, 1);
    assert.deepEqual(setupIssuesOf(g), [], script);
    execute(g, host, { action: 'start' }, 2);
    assert.equal(g.phase, 'night');
  }
});
const setupIssuesOf = (g: Game) => view(g, host, 1, 1).issues;

void test('night order follows the Horrors of Fearville sheet', () => {
  const g = game([
    'sheriff',
    'hoflibrarian',
    'teacher',
    'psychic',
    'detective',
    'judge',
    'lostwanderer',
    'basilisk',
    'sphinx',
    'wraith',
    'doctor',
    'watchman',
    'bodyguard',
    'mortician',
  ]);
  assert.deepEqual(order(g), [
    'minioninfo',
    'demoninfo',
    'basilisk:8',
    'lostwanderer:7',
    'sheriff:1',
    'hoflibrarian:2',
    'teacher:3',
    'psychic:4',
    'detective:5',
    'judge:6',
  ]);
  dawn(g);
  toNight(g);
  assert.deepEqual(order(g), [
    'basilisk:8',
    'lostwanderer:7',
    'doctor:11',
    'wraith:10',
    'detective:5',
    'judge:6',
    'psychic:4',
    'watchman:12',
  ]);
});

void test('the Doctor saves the Monster’s victim; the Watchman sees both visitors', () => {
  const g = game(NINE);
  dawn(g);
  toNight(g);
  choose(g, 1, { target: P(g, 5).id }); // Doctor saves the Detective
  choose(g, 4, { target: P(g, 5).id, fearTarget: P(g, 6).id }); // Monster attacks the Detective
  choose(g, 2, { target: P(g, 5).id }); // Watchman watches the Detective
  choose(g, 3, { target: P(g, 6).id }); // Basilisk fears the Judge
  runNight(g);
  assert.ok(P(g, 5).alive, 'the save prevents the kill');
  assert.notEqual(
    P(g, 6).fearNight,
    g.night + 1,
    'a saved target causes no Monster fear',
  );
  assert.ok(
    !g.messages.some(
      (m) => m.to === P(g, 9).id && /will die tonight/.test(m.text),
    ),
  );
  const watch = g.messages.filter((m) => m.to === P(g, 2).id).at(-1)!.text;
  assert.match(watch, /P1/);
  assert.match(watch, /P4/);
});

void test('a feared Doctor fails to save; the Monster’s victim dies and a neighbor is feared next night', () => {
  const g = game(NINE);
  dawn(g);
  toNight(g);
  choose(g, 3, { target: P(g, 1).id }); // Basilisk fears the Doctor
  choose(g, 1, { target: P(g, 5).id });
  choose(g, 4, { target: P(g, 5).id, fearTarget: P(g, 6).id });
  runNight(g);
  assert.ok(P(g, 1).feared);
  assert.equal(P(g, 5).alive, false);
  const neighbor = P(g, 6);
  assert.equal(
    neighbor.fearNight,
    g.night + 1,
    'the Monster’s chosen neighbor is feared',
  );
  execute(g, host, { action: 'dawn' }, later());
  assert.equal(P(g, 1).feared, false, 'fear ends at dawn');
  toNight(g);
  assert.equal(neighbor.feared, true);
});

void test('the Monster can fear only a living neighbor of the chosen target', () => {
  const g = game(NINE);
  dawn(g);
  toNight(g);
  assert.throws(
    () =>
      choose(g, 4, {
        target: P(g, 5).id,
        fearTarget: P(g, 8).id,
      }),
    /living neighbors/,
  );
  choose(g, 4, { target: P(g, 5).id, fearTarget: P(g, 6).id });
  assert.equal(
    g.nightChoices?.['monster:' + P(g, 4).id]?.fearTarget,
    P(g, 6).id,
  );
});

void test('the Bodyguard dies in the victim’s place', () => {
  const g = game(NINE);
  dawn(g);
  toNight(g);
  assert.equal(
    nightChoiceTask(g, P(g, 9).id),
    null,
    'the Bodyguard is not prompted during the night choice window',
  );
  choose(g, 4, { target: P(g, 6).id, fearTarget: P(g, 5).id });
  assert.ok(
    !g.messages.some(
      (m) => m.to === P(g, 9).id && /will die tonight/.test(m.text),
    ),
  );
  runNight(g, {}, { bodyguardAccept: true });
  assert.ok(P(g, 6).alive);
  assert.equal(P(g, 9).alive, false);
  assert.match(
    g.messages.filter((m) => m.to === P(g, 9).id).at(-1)!.text,
    /P6/,
  );
  assert.doesNotMatch(
    g.messages.filter((m) => m.to === P(g, 9).id).at(-1)!.text,
    /Judge|role/i,
    'the Bodyguard learns only the target’s name',
  );
  assert.ok(
    !P(g, 5).fearNight && !P(g, 7).fearNight,
    'Monster fear does not trigger when the target survives',
  );
});

void test('the Guardian dies in place of their ward, even when executed', () => {
  const g = game(NINE, { ['charge_' + 'x']: '' });
  const guardian = P(g, 8);
  guardian.charge = P(g, 6).id;
  dawn(g);
  execute(g, host, { action: 'overridePhase', phase: 'dayReview' }, later());
  execute(g, host, { action: 'execute', target: P(g, 6).id }, later());
  settle(g);
  assert.ok(P(g, 6).alive);
  assert.equal(guardian.alive, false);
});

void test('a hidden Wraith is not seen by the Watchman or the Mortician', () => {
  const g = game([
    'watchman',
    'mortician',
    'basilisk',
    'wraith',
    'judge',
    'doctor',
    'detective',
  ]);
  dawn(g);
  toNight(g);
  choose(g, 4, { target: P(g, 5).id, flag: true });
  choose(g, 1, { target: P(g, 5).id });
  runNight(g);
  assert.equal(P(g, 5).alive, false);
  assert.match(
    g.messages.filter((m) => m.to === P(g, 1).id).at(-1)!.text,
    /Nobody visited P5/,
  );
  execute(g, host, { action: 'dawn' }, later());
  toNight(g);
  choose(g, 2, { target: P(g, 5).id });
  runNight(g);
  const text = g.messages.filter((m) => m.to === P(g, 2).id).at(-1)!.text;
  assert.match(text, /Watchman/);
  assert.doesNotMatch(text, /Wraith/);
  assert.ok(P(g, 2).used);
});

void test('the Detective’s false positive and the Judge’s neutral Travelers', () => {
  const g = game(NINE);
  g.redHerring = P(g, 2).id;
  choose(g, 5, { target: P(g, 2).id, target2: P(g, 6).id });
  choose(g, 6, { target: P(g, 1).id, target2: P(g, 8).id });
  runNight(g);
  const detective = g.messages.filter((m) => m.to === P(g, 5).id).at(-1)!.text;
  assert.match(detective, /Yes/);
  const judge = g.messages.filter((m) => m.to === P(g, 6).id).at(-1)!.text;
  assert.match(judge, /different alignments/, 'a Traveler is neutral');
  assert.match(
    g.messages.find((m) => m.to === P(g, 8).id)!.text,
    /alignment is neutral/,
  );
  assert.equal(view(g, as(g, 8), 1, clock).character?.alignment, 'neutral');
});

void test('the Psychic is sent to a different role type each night', () => {
  const g = game([
    'psychic',
    'doctor',
    'watchman',
    'basilisk',
    'monster',
    'judge',
  ]);
  const skipToPsychic = () => {
    for (
      let t = tasks(g).find((t) => !t.done);
      t?.role !== 'psychic';
      t = tasks(g).find((t) => !t.done)
    )
      execute(g, host, { action: 'nightSkip' }, after(g));
  };
  skipToPsychic();
  resolve(g, { target: P(g, 2).id }); // Night 1: a Villager
  dawn(g);
  toNight(g);
  skipToPsychic();
  assert.throws(() => resolve(g, { target: P(g, 3).id }), /role type/);
  resolve(g, { target: P(g, 4).id });
  assert.match(
    g.messages.filter((m) => m.to === P(g, 1).id).at(-1)!.text,
    /^Tonight you visit P4\.$/,
  );
});

void test('the Vigilante declares once by day; the Storyteller rules', () => {
  const g = game([
    'vigilante',
    'doctor',
    'watchman',
    'basilisk',
    'monster',
    'judge',
  ]);
  assert.ok(
    !view(g, as(g, 1), 1, clock).controls.some(
      (c) => c.action === 'vigilanteDeclare',
    ),
    'not at night',
  );
  dawn(g);
  execute(
    g,
    as(g, 1),
    { action: 'vigilanteDeclare', target: P(g, 5).id, confirm: true },
    later(),
  );
  assert.match(g.messages.at(-1)!.text, /I am the Vigilante and I declare/);
  assert.ok(P(g, 1).used);
  execute(g, host, { action: 'vigilante' }, later());
  settle(g);
  assert.equal(P(g, 5).alive, false);
  assert.ok(
    !view(g, as(g, 1), 1, clock).controls.some(
      (c) => c.action === 'vigilanteDeclare',
    ),
  );
});

void test('Researcher and Executioner wins are added to the team result', () => {
  const g = game([
    'researcher',
    'executioner',
    'doctor',
    'watchman',
    'basilisk',
    'monster',
    'judge',
  ]);
  const exec = P(g, 2);
  exec.charge = P(g, 4).id;
  dawn(g);
  P(g, 1).alive = false;
  P(g, 2).alive = false;
  assert.ok(
    view(g, as(g, 1), 1, clock).controls.some(
      (c) => c.action === 'researcherDeclare',
    ),
  );
  execute(
    g,
    as(g, 1),
    {
      action: 'researcherDeclare',
      player1: P(g, 3).id,
      role1: 'doctor',
      player2: P(g, 4).id,
      role2: 'watchman',
      player3: P(g, 5).id,
      role3: 'basilisk',
    },
    later(),
  );
  assert.ok(
    !g.messages.some(
      (m) => m.to === P(g, 1).id && /declaration was/.test(m.text),
    ),
    'the Researcher does not learn the result yet',
  );
  execute(g, host, { action: 'overridePhase', phase: 'dayReview' }, later());
  execute(g, host, { action: 'execute', target: P(g, 4).id }, later());
  settle(g);
  P(g, 6).alive = false;
  execute(g, host, { action: 'finishDay' }, later());
  assert.equal(g.phase, 'ended');
  assert.match(
    g.winner,
    /^Good · Travelers: P1 \(Researcher\), P2 \(Executioner\) also win$/,
  );
  assert.match(
    g.messages.filter((m) => m.to === P(g, 1).id).at(-1)!.text,
    /correct about all three/,
  );
  const record = deriveResult(g, 1, 2)!;
  const seat = (n: number) =>
    record.seats.find((s) => s.player === P(g, n).id)!;
  assert.equal(seat(1).team, 'neutral');
  assert.equal(seat(1).won, true);
  assert.equal(seat(3).won, true);
  assert.equal(seat(6).won, false);
});

void test('a killed Hag declares by day; the target dies that night only if Good', () => {
  const g = game([
    'hag',
    'doctor',
    'watchman',
    'basilisk',
    'monster',
    'judge',
    'executioner',
  ]);
  dawn(g);
  toNight(g);
  choose(g, 5, { target: P(g, 1).id });
  runNight(g);
  assert.equal(P(g, 1).alive, false);
  assert.throws(
    () =>
      execute(
        g,
        as(g, 1),
        { action: 'hagDeclare', target: P(g, 2).id },
        later(),
      ),
    /morning/,
  );
  execute(g, host, { action: 'dawn' }, later());
  execute(g, as(g, 1), { action: 'hagDeclare', target: P(g, 7).id }, later());
  assert.match(g.messages.at(-1)!.text, /I am the Hag/);
  toNight(g);
  runNight(g);
  assert.ok(P(g, 7).alive, 'a neutral Traveler is not Good');
});

void test('an executed Banshee fears every Villager that night', () => {
  const g = game([
    'banshee',
    'doctor',
    'watchman',
    'judge',
    'monster',
    'hunter',
  ]);
  dawn(g);
  execute(g, host, { action: 'overridePhase', phase: 'dayReview' }, later());
  execute(g, host, { action: 'execute', target: P(g, 1).id }, later());
  settle(g);
  execute(g, host, { action: 'finishDay' }, later());
  for (const n of [2, 3, 4, 6]) assert.equal(P(g, n).feared, true, `seat ${n}`);
  assert.notEqual(P(g, 5).feared, true);
});

void test('a Hunter killed at night may take a Haunt', () => {
  const g = game([
    'hunter',
    'doctor',
    'watchman',
    'basilisk',
    'monster',
    'judge',
  ]);
  dawn(g);
  toNight(g);
  choose(g, 5, { target: P(g, 1).id });
  runNight(g, {}, { hunterHaunt: P(g, 4).id });
  assert.equal(P(g, 1).alive, false);
  assert.equal(P(g, 4).alive, false);
});

void test('the Sphinx sees every role until the night-choice timer ends', () => {
  const g = game(['sphinx', 'doctor', 'watchman', 'judge', 'monster', 'drunk']);
  const v = view(g, as(g, 1), 1, clock);
  assert.ok(v.glimpse);
  assert.deepEqual(
    v.glimpse.entries.map((e) => e.role),
    ['Sphinx', 'Doctor', 'Watchman', 'Judge', 'Monster', 'Drunk'],
  );
  assert.equal(view(g, as(g, 2), 1, clock).glimpse, null);
  assert.equal(view(g, as(g, 1), 1, g.nightChoiceDeadline! + 1).glimpse, null);
});
