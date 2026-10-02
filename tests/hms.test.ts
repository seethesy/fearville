import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer, type Game } from '../lib/game/types.ts';
import { execute, tasks, nightChoiceTask } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import {
  pendingDeath,
  astrologistSuggestion,
  seatNeighbors,
  suggestions,
  nightChoicesReady,
} from '../lib/game/hms.ts';
import { HMS_ROLES } from '../lib/game/types.ts';

const host = { id: 'host', host: true };
let clock = 0;
const later = () => (clock += 1000);
// Storyteller night actions wait for the night-choice window to close.
const after = (g: Game) =>
  (clock = Math.max(clock, g.nightChoiceDeadline ?? 0) + 1000);

// Seat order follows the role list. Hidden Villagers: [seat index, villager].
function game(roles: string[], hidden: Record<number, string> = {}) {
  clock = 0;
  const g = newGame('HMS', 'Host');
  g.script = 'holyMoonStars';
  g.players = roles.map((r, i) => ({
    ...newPlayer('P' + (i + 1), i + 1),
    role: r,
    shown: r,
  }));
  for (const [i, v] of Object.entries(hidden)) {
    const p = g.players[Number(i)];
    if (p.role === 'lostsoul') {
      p.acts = v;
      p.shown = 'lostsoul';
    } else p.shown = v;
  }
  const used = g.players.flatMap((p) => [p.role, p.shown, p.acts ?? '']);
  g.bluffs =
    roles.length >= 7
      ? HMS_ROLES.filter(
          (r) =>
            ['townsfolk', 'outsider'].includes(r.team) &&
            r.id !== 'atheist' &&
            !used.includes(r.id),
        )
          .slice(0, 3)
          .map((r) => r.id)
      : [];
  execute(g, host, { action: 'start' }, later());
  return g;
}
const P = (g: Game, n: number) => g.players[n - 1];
const order = (g: Game) =>
  tasks(g).map(
    (t) =>
      t.key.split(':')[0] +
      (t.player && t.player !== 'storyteller'
        ? ':' + g.players.find((p) => p.id === t.player)!.seat
        : t.player
          ? ':ST'
          : ''),
  );
function choose(g: Game, seat: number, c: Record<string, unknown>) {
  const p = P(g, seat);
  const t = nightChoiceTask(g, p.id);
  assert.ok(t, `seat ${seat} has a night choice`);
  const deadline = view(g, { id: p.id, host: false }, 1, clock).nightChoice
    ?.deadline;
  assert.ok(deadline, `seat ${seat} has an active deadline`);
  return execute(
    g,
    { id: p.id, host: false },
    { action: 'nightChoice', task: t.key, round: t.round, ...c },
    deadline - 1,
  );
}
// Confirms the current task with the form's defaults, as a Storyteller would,
// filling in targets for players who did not choose.
function resolve(g: Game, c: Record<string, unknown> = {}) {
  const t = tasks(g).find((t) => !t.done)!;
  assert.ok(t, 'a night task remains');
  const choice = g.nightChoices?.[t.key];
  const control = view(g, host, 1, clock).controls.find(
    (x) => x.action === 'night',
  )!;
  const base: Record<string, unknown> = Object.fromEntries(
    control.fields.map((f) => [f.key, f.value ?? '']),
  );
  Object.assign(base, {
    action: 'night',
    task: t.key,
    choiceId: choice?.id ?? '',
    poisonAcknowledged: true,
  });
  const keys = ['target', 'target2', 'target3'].filter((k) => k in base);
  const actor = g.players.find((p) => p.id === t.player);
  const others = g.players.filter((p) => p.alive && p.id !== t.player);
  if (!['gravedigger', 'priest', 'necromancer'].includes(t.role))
    keys.forEach((k, i) => {
      if (!base[k])
        base[k] =
          t.role === 'mystic'
            ? seatNeighbors(g, actor!)[0].id
            : t.role === 'medium'
              ? g.hms!.nightStartDead[0]
              : others[i].id;
    });
  if (t.role === 'astrologist' && !base.reveal1)
    [base.reveal1, base.reveal2, base.reveal3] = astrologistSuggestion(
      g,
      keys.map((k) => String(base[k])),
    );
  if (t.role === 'guess' && !choice?.guesses) base.pass = true;
  return execute(g, host, { ...base, ...c, action: 'night' }, after(g));
}
// Tasks that would kill or infect are skipped unless a player chose.
const HARMFUL = ['miasma', 'grimreaper', 'werewolf', 'nightmare'];
function step(g: Game) {
  const t = tasks(g).find((t) => !t.done)!;
  const control = view(g, host, 1, clock).controls.find(
    (x) => x.action === 'night',
  )!;
  if (
    HARMFUL.includes(t.role) &&
    !g.nightChoices?.[t.key] &&
    control.fields.some((f) => f.key === 'target')
  )
    return execute(
      g,
      host,
      { action: 'nightSkip', reason: 'no choice in test' },
      after(g),
    );
  return resolve(g);
}
function deaths(g: Game, c: Record<string, unknown> = {}) {
  const d = pendingDeath(g)!;
  assert.ok(d, 'a death is pending');
  return execute(
    g,
    host,
    { action: 'resolveDeath', death: d.id, ...c },
    later(),
  );
}
function finishNight(g: Game) {
  while (tasks(g).some((t) => !t.done)) {
    if (pendingDeath(g)) deaths(g);
    else step(g);
  }
  while (pendingDeath(g)) deaths(g);
  execute(g, host, { action: 'dawn' }, after(g));
}
function toNight(g: Game, execution?: number) {
  execute(
    g,
    host,
    { action: 'overridePhase', phase: 'dayReview', reason: 'testing' },
    later(),
  );
  if (execution) {
    execute(
      g,
      host,
      {
        action: 'execute',
        target: P(g, execution).id,
        override: true,
        reason: 'testing',
      },
      later(),
    );
    while (pendingDeath(g)) deaths(g);
  }
  execute(
    g,
    host,
    {
      action: 'finishDay',
      override: true,
      reason: 'testing',
      ruling: 'continue',
    },
    later(),
  );
  assert.equal(g.phase, 'night');
}
const lastMessage = (g: Game, seat: number) =>
  g.messages.filter((m) => m.to === P(g, seat).id).at(-1)?.text ?? '';

const EIGHT = [
  'constellation',
  'astrologist',
  'mystic',
  'astronaut',
  'prophet',
  'insomniac',
  'nightmare',
  'miasma',
];

void test('Holy Moon and Stars starts, deals privately, and follows the Night 1 order', () => {
  const g = game(EIGHT);
  assert.equal(g.phase, 'night');
  assert.deepEqual(order(g), [
    'minioninfo',
    'demoninfo',
    'constellation:1',
    'astrologist:2',
    'mystic:3',
    'astronaut:4',
    'prophet:5',
    'miasma:8',
    'insomniac:6',
  ]);
  assert.match(lastMessage(g, 1), /Constellation/);
  const v = view(g, { id: P(g, 1).id, host: false }, 1, clock);
  assert.equal(v.nightChoice?.count, 3);
  assert.equal(
    view(
      g,
      { id: P(g, 3).id, host: false },
      1,
      clock,
    ).nightChoice?.options.filter((o) => o.eligible).length,
    2,
  );
});

void test('setup checks counts, the Moonshiner, hidden Villagers, and the script', () => {
  const g = newGame('HMS', 'Host');
  g.script = 'holyMoonStars';
  g.players = ['washerwoman', 'chef', 'empath', 'poisoner', 'imp'].map(
    (r, i) => ({ ...newPlayer('P' + i, i + 1), role: r, shown: r }),
  );
  assert.throws(
    () =>
      execute(
        g,
        host,
        { action: 'start', override: true, reason: 'testing' },
        1,
      ),
    /from this script/,
  );
  g.players.forEach(
    (p, i) =>
      (p.role = p.shown = [
        'astrologist',
        'mystic',
        'medium',
        'moonshiner',
        'miasma',
      ][i]),
  );
  assert.ok(
    view(g, host, 1, 1).issues.some((i) => /2 Villagers, 1 Fools/.test(i)),
  );
  g.players[2].role = g.players[2].shown = 'dazed';
  assert.ok(
    view(g, host, 1, 1).issues.some((i) => /out-of-play Villager/.test(i)),
  );
  g.players[2].shown = 'spirit';
  assert.deepEqual(view(g, host, 1, 1).issues, []);
  execute(g, host, { action: 'start' }, 2);
  assert.equal(g.players[2].drunk, true);
  assert.match(
    g.messages.find((m) => m.to === g.players[2].id)!.text,
    /Spirit/,
  );
  // Sobering reveals the real Fool character.
  execute(g, host, { action: 'soberFools', confirm: true }, 3);
  assert.equal(g.players[2].shown, 'dazed');
  assert.equal(g.players[2].drunk, true);
});

void test('random assignment deals valid setups for every size', () => {
  for (let n = 5; n <= 15; n++)
    for (let k = 0; k < 6; k++) {
      const g = newGame('HMS', 'Host');
      g.script = 'holyMoonStars';
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
      assert.ok(!g.players.some((p) => p.role === 'atheist'));
    }
});

void test('Night 1 information, Mystic connections, and visits feed the Insomniac', () => {
  const g = game(EIGHT);
  choose(g, 1, {
    target: P(g, 2).id,
    target2: P(g, 6).id,
    target3: P(g, 1).id,
  });
  choose(g, 2, {
    target: P(g, 6).id,
    target2: P(g, 7).id,
    target3: P(g, 8).id,
  });
  choose(g, 3, { target: P(g, 2).id });
  choose(g, 8, { target: P(g, 6).id });
  resolve(g);
  resolve(g);
  assert.match(lastMessage(g, 7), /Horror is P8/);
  assert.match(lastMessage(g, 8), /Haunts: P7 \(Nightmare\)/);
  resolve(g);
  assert.deepEqual(g.hms!.constellation!.members, [
    P(g, 2).id,
    P(g, 6).id,
    P(g, 1).id,
  ]);
  // The Astrologist's suggestion is accepted; a wrong set is refused.
  assert.throws(
    () =>
      resolve(g, { reveal1: 'medium', reveal2: 'spirit', reveal3: 'priest' }),
    /Exactly one/,
  );
  resolve(g, { reveal1: 'nightmare', reveal2: 'spirit', reveal3: 'priest' });
  assert.match(lastMessage(g, 2), /Nightmare, Spirit, Priest/);
  const mystic = view(g, host, 1, clock).controls.find(
    (c) => c.action === 'night',
  )!;
  assert.equal(mystic.fields.find((f) => f.key === 'link1')?.value, P(g, 6).id);
  resolve(g, { link1: P(g, 6).id, link2: P(g, 7).id });
  assert.match(lastMessage(g, 3), /P2 may be connected to P6, P7/);
  resolve(g);
  assert.match(lastMessage(g, 4), /nearest evil player is 3 seats/);
  resolve(g);
  assert.match(lastMessage(g, 5), /Nightmare, Miasma/);
  resolve(g);
  assert.equal(g.hms!.infected!.target, P(g, 6).id);
  resolve(g);
  assert.match(
    lastMessage(g, 6),
    /Visited by: P1, P2, P8\. Neighbors who visited someone: 0/,
  );
  execute(g, host, { action: 'dawn' }, after(g));
  assert.equal(g.phase, 'discovery');
});

void test('the plague kills first and poisons neighbors before they act', () => {
  const g = game(EIGHT);
  choose(g, 8, { target: P(g, 4).id });
  finishNight(g);
  toNight(g);
  assert.deepEqual(order(g).slice(0, 1), ['plague']);
  resolve(g);
  assert.equal(P(g, 3).poisoned, true);
  assert.equal(P(g, 5).poisoned, true);
  // Night tasks wait for the plague death.
  assert.throws(
    () =>
      execute(
        g,
        host,
        { action: 'night', task: tasks(g).find((t) => !t.done)!.key },
        after(g),
      ),
    /pending death/,
  );
  deaths(g);
  assert.equal(P(g, 4).alive, false);
  assert.equal(P(g, 4).publicAlive, true);
  finishNight(g);
  assert.deepEqual(g.dawnAnnouncement!.names, ['P4']);
  toNight(g);
  assert.equal(P(g, 3).poisoned, false);
});

void test('Werewolf deaths wait until after Spirit and Insomniac, then pass through prevention and the Fateweaver', () => {
  const g = game([
    'fateweaver',
    'spirit',
    'insomniac',
    'priest',
    'diviner',
    'zealot',
    'astrophage',
    'werewolf',
  ]);
  finishNight(g);
  toNight(g);
  finishNight(g);
  toNight(g);
  assert.equal(g.night, 3);
  P(g, 2).extraLife = 1;
  choose(g, 8, {
    target: P(g, 2).id,
    target2: P(g, 4).id,
    target3: P(g, 6).id,
  });
  choose(g, 2, { target: P(g, 4).id });
  choose(g, 5, { text: 'Who is the wolf?' });
  assert.deepEqual(order(g), [
    'diviner:5',
    'werewolf:8',
    'spirit:2',
    'insomniac:3',
  ]);
  resolve(g, { target: P(g, 1).id });
  assert.match(lastMessage(g, 5), /Who is the wolf\?.*speak to P1/);
  resolve(g);
  assert.equal(g.hms!.deathQueue.length, 3);
  assert.equal(pendingDeath(g), null);
  resolve(g);
  assert.equal(lastMessage(g, 2), '1 evil\n0 good');
  resolve(g);
  resolve(g);
  // P2 survives on an extra life.
  deaths(g);
  assert.equal(P(g, 2).alive, true);
  assert.equal(P(g, 2).extraLife, 0);
  // P4 is the Priest: killed, they return at dawn as an out-of-play Villager.
  deaths(g, { priestRole: 'medium' });
  // P6 is the Zealot, next to... nobody with a Fateweaver. The Storyteller gains an ability.
  assert.throws(() => deaths(g), /Zealot grants/);
  deaths(g, { zealotRole: 'grimreaper' });
  execute(g, host, { action: 'dawn' }, after(g));
  assert.equal(P(g, 4).alive, true);
  assert.equal(P(g, 4).role, 'medium');
  assert.deepEqual(g.dawnAnnouncement!.names, ['P6']);
  assert.equal(view(g, host, 1, clock).storytellerAbility, 'Grim Reaper');
  toNight(g);
  assert.ok(order(g).includes('grimreaper:ST'));
});

void test('the Fateweaver redirects a neighbor’s death once, and the new target is checked again', () => {
  const g = game([
    'astronaut',
    'fateweaver',
    'insomniac',
    'priest',
    'diviner',
    'zealot',
    'astrophage',
    'werewolf',
  ]);
  finishNight(g);
  toNight(g);
  finishNight(g);
  toNight(g);
  P(g, 5).extraLife = 1;
  choose(g, 8, {
    target: P(g, 1).id,
    target2: P(g, 3).id,
    target3: P(g, 4).id,
  });
  while (tasks(g).some((t) => !t.done)) resolve(g);
  const control = view(g, host, 1, clock).controls.find(
    (c) => c.action === 'resolveDeath',
  )!;
  assert.ok(control.fields.some((f) => f.key === 'fateweaver'));
  deaths(g, { fateweaver: P(g, 5).id });
  assert.equal(P(g, 1).alive, true);
  assert.equal(pendingDeath(g)!.player, P(g, 5).id);
  assert.ok(
    !view(g, host, 1, clock)
      .controls.find((c) => c.action === 'resolveDeath')!
      .fields.some((f) => f.key === 'fateweaver'),
  );
  deaths(g);
  assert.equal(P(g, 5).alive, true);
  // Used: P3 is also the Fateweaver's neighbor, but there is no second redirect.
  assert.ok(
    !view(g, host, 1, clock)
      .controls.find((c) => c.action === 'resolveDeath')!
      .fields.some((f) => f.key === 'fateweaver'),
  );
});

void test('the Celestial stops good deaths by day; an executed Celestial poisons everyone and makes a Villager drunk', () => {
  const g = game([
    'celestial',
    'astronaut',
    'insomniac',
    'astrophage',
    'grimreaper',
  ]);
  finishNight(g);
  execute(
    g,
    host,
    { action: 'overridePhase', phase: 'dayReview', reason: 'testing' },
    later(),
  );
  execute(
    g,
    host,
    {
      action: 'execute',
      target: P(g, 2).id,
      override: true,
      reason: 'testing',
    },
    later(),
  );
  assert.match(
    view(g, host, 1, clock).controls.find((c) => c.action === 'resolveDeath')!
      .description,
    /Celestial/,
  );
  deaths(g);
  assert.equal(P(g, 2).alive, true);
  execute(
    g,
    host,
    { action: 'finishDay', override: true, reason: 'testing' },
    later(),
  );
  finishNight(g);
  execute(
    g,
    host,
    { action: 'overridePhase', phase: 'dayReview', reason: 'testing' },
    later(),
  );
  execute(
    g,
    host,
    {
      action: 'execute',
      target: P(g, 1).id,
      override: true,
      reason: 'testing',
    },
    later(),
  );
  deaths(g, { celestialDrunk: P(g, 3).id });
  assert.ok(g.players.every((p) => p.poisoned));
  assert.equal(P(g, 3).drunk, true);
  execute(
    g,
    host,
    { action: 'finishDay', override: true, reason: 'testing' },
    later(),
  );
  assert.ok(
    g.players.every((p) => p.poisoned),
    'poison lasts through the next night',
  );
  finishNight(g);
  toNight(g);
  assert.ok(
    g.players.every((p) => !p.poisoned),
    'poison ends at the following dusk',
  );
  assert.equal(P(g, 3).drunk, true);
});

void test('Grim Reaper marks and reaps on confirmation; the Astrophage ends the day', () => {
  const g = game([
    'astronaut',
    'insomniac',
    'diviner',
    'spirit',
    'priest',
    'zealot',
    'astrophage',
    'grimreaper',
  ]);
  choose(g, 8, { target: P(g, 2).id });
  finishNight(g);
  assert.equal(P(g, 2).marked, true);
  const reaper = { id: P(g, 8).id, host: false };
  assert.ok(
    view(g, reaper, 1, clock).controls.some((c) => c.action === 'reap'),
  );
  assert.throws(
    () => execute(g, reaper, { action: 'reap' }, later()),
    /Confirm/,
  );
  execute(g, reaper, { action: 'reap', confirm: true }, later());
  deaths(g);
  assert.equal(P(g, 2).alive, false);
  assert.equal(P(g, 2).publicAlive, false);
  const astro = { id: P(g, 7).id, host: false };
  execute(g, astro, { action: 'astrophage', confirm: true }, later());
  assert.equal(g.phase, 'night');
  assert.ok(
    g.messages.some((m) => m.to === 'all' && /day ends early/.test(m.text)),
  );
  assert.throws(
    () => execute(g, astro, { action: 'astrophage', confirm: true }, later()),
    /cannot end/,
  );
});

void test('Dreameater: correct guesses die, the third wrong guess kills it and voids that night', () => {
  const g = game([
    'astronaut',
    'insomniac',
    'diviner',
    'spirit',
    'priest',
    'zealot',
    'necromancer',
    'dreameater',
  ]);
  choose(g, 8, {
    guesses: [
      { player: P(g, 1).id, role: 'astronaut' },
      { player: P(g, 2).id, role: 'spirit' },
    ],
  });
  finishNight(g);
  assert.equal(P(g, 1).alive, false);
  assert.equal(P(g, 8).misses, 1);
  toNight(g);
  choose(g, 8, {
    guesses: [
      { player: P(g, 3).id, role: 'diviner' },
      { player: P(g, 4).id, role: 'medium' },
      { player: P(g, 5).id, role: 'astronaut' },
    ],
  });
  finishNight(g);
  assert.equal(P(g, 8).alive, false);
  assert.equal(P(g, 3).alive, true);
  assert.ok(
    view(g, host, 1, clock).hints.includes('No living Horror: good wins.'),
  );
});

void test('Medium opens a private channel, grants a dead player their ability, and hides the channel at dawn', () => {
  const g = game([
    'medium',
    'insomniac',
    'diviner',
    'spirit',
    'zealot',
    'astronaut',
    'necromancer',
    'dreameater',
  ]);
  finishNight(g);
  toNight(g, 2);
  choose(g, 1, { target: P(g, 2).id });
  assert.equal(order(g)[0], 'medium:1');
  resolve(g);
  assert.ok(order(g).includes('insomniac:2'), 'dead Insomniac acts tonight');
  const dead = { id: P(g, 2).id, host: false };
  execute(
    g,
    dead,
    { action: 'chat', to: 'channel', text: 'hello from beyond' },
    later(),
  );
  assert.equal(
    view(g, { id: P(g, 1).id, host: false }, 1, clock).channel?.with,
    'P2',
  );
  assert.ok(
    view(g, { id: P(g, 1).id, host: false }, 1, clock).messages.some(
      (m) => m.text === 'hello from beyond',
    ),
  );
  assert.ok(
    !view(g, { id: P(g, 3).id, host: false }, 1, clock).messages.some(
      (m) => m.text === 'hello from beyond',
    ),
  );
  finishNight(g);
  assert.ok(
    !view(g, { id: P(g, 1).id, host: false }, 1, clock).messages.some(
      (m) => m.text === 'hello from beyond',
    ),
  );
  assert.ok(
    g.log.some((l) => /Medium channel[\s\S]*hello from beyond/.test(l.text)),
  );
});

void test('Priest and Necromancer revive at dawn with switched alignment; the Gravedigger becomes the character', () => {
  const g = game([
    'priest',
    'gravedigger',
    'astronaut',
    'insomniac',
    'diviner',
    'zealot',
    'necromancer',
    'grimreaper',
  ]);
  finishNight(g);
  toNight(g, 3);
  finishNight(g);
  toNight(g, 4);
  choose(g, 7, { target: P(g, 4).id });
  choose(g, 2, { target: P(g, 3).id });
  assert.deepEqual(order(g).slice(0, 3), [
    'gravedigger:2',
    'priest:1',
    'necromancer:7',
  ]);
  resolve(g);
  resolve(g);
  assert.match(lastMessage(g, 1), /did not use/);
  assert.throws(() => resolve(g), /out-of-play Haunt/);
  resolve(g, { newRole: 'nightmare' });
  finishNight(g);
  assert.equal(P(g, 4).alive, true);
  assert.equal(P(g, 4).role, 'nightmare');
  assert.match(lastMessage(g, 4), /alignment is evil/);
  assert.equal(P(g, 2).role, 'astronaut');
});

void test('an executed Nightmare haunts a player and redirects them once, after a Dazed redirect', () => {
  const g = game(
    [
      'astronaut',
      'insomniac',
      'dazed',
      'spirit',
      'priest',
      'medium',
      'nightmare',
      'miasma',
    ],
    { 2: 'diviner' },
  );
  finishNight(g);
  toNight(g, 7);
  choose(g, 7, { target: P(g, 4).id });
  choose(g, 4, { target: P(g, 3).id });
  assert.equal(order(g)[0], 'nightmare:7');
  resolve(g);
  assert.equal(g.hms!.nightmare!.bound, P(g, 4).id);
  const firstRedirect = nightChoiceTask(g, P(g, 7).id)!;
  assert.equal(firstRedirect.role, 'nightmareRedirect');
  assert.equal(
    view(g, { id: P(g, 7).id, host: false }, 1, clock).nightChoice!.deadline,
    g.nightChoiceDeadlines![firstRedirect.key],
  );
  choose(g, 7, { pass: true });
  // On the next night, no redirect is offered until the haunted player acts.
  finishNight(g);
  toNight(g);
  assert.equal(nightChoiceTask(g, P(g, 7).id), null);
  const targetDeadline = view(g, { id: P(g, 4).id, host: false }, 1, clock)
    .nightChoice!.deadline!;
  choose(g, 4, { target: P(g, 3).id });
  const redirect = nightChoiceTask(g, P(g, 7).id)!;
  assert.equal(redirect.role, 'nightmareRedirect');
  assert.ok('label' in redirect);
  assert.match(redirect.label, /P4 chose a player/);
  assert.equal(
    g.nightChoiceDeadlines![redirect.key],
    targetDeadline - 1 + 60000,
  );
  choose(g, 7, { target: P(g, 6).id });
  assert.equal(tasks(g).find((t) => !t.done)!.role, 'nightmareRuling');
  const ruling = view(g, host, 1, clock).controls.find(
    (c) => c.action === 'night',
  )!;
  assert.equal(
    ruling.fields.find((f) => f.key === 'target')?.value,
    P(g, 6).id,
  );
  resolve(g);
  while (tasks(g).find((t) => !t.done)!.role !== 'spirit') resolve(g);
  const form = view(g, host, 1, clock).controls.find(
    (c) => c.action === 'night',
  )!;
  assert.match(form.description, /Dazed/);
  assert.equal(form.fields.find((f) => f.key === 'target')?.value, P(g, 6).id);
  assert.ok(!form.fields.some((f) => f.key.startsWith('final')));
  resolve(g);
  assert.equal(g.hms!.nightmare!.used, true);
  assert.ok(
    g.hms!.visits.some((v) => v.from === P(g, 4).id && v.to === P(g, 6).id),
  );
});

void test('Constellation guesses after Night 1; a wrong guess breaks the link', () => {
  const g = game(EIGHT);
  choose(g, 1, {
    target: P(g, 2).id,
    target2: P(g, 3).id,
    target3: P(g, 4).id,
  });
  finishNight(g);
  toNight(g);
  assert.ok(order(g).includes('guess:1'));
  choose(g, 1, {
    guesses: [P(g, 2).id, P(g, 3).id, P(g, 4).id].map((player) => ({
      player,
      role: 'mystic',
    })),
  });
  while (tasks(g).find((t) => !t.done)!.role !== 'guess') resolve(g);
  resolve(g, { killSelf: true });
  assert.equal(g.hms!.constellation!.linked, false);
  finishNight(g);
  assert.equal(P(g, 1).alive, false);
});

void test('Constellation link deaths are the Storyteller’s choice', () => {
  const g = game(EIGHT);
  choose(g, 1, {
    target: P(g, 2).id,
    target2: P(g, 3).id,
    target3: P(g, 4).id,
  });
  finishNight(g);
  execute(
    g,
    host,
    { action: 'overridePhase', phase: 'dayReview', reason: 'testing' },
    later(),
  );
  execute(
    g,
    host,
    {
      action: 'execute',
      target: P(g, 2).id,
      override: true,
      reason: 'testing',
    },
    later(),
  );
  deaths(g, { ['link_' + P(g, 3).id]: true });
  deaths(g);
  assert.equal(P(g, 3).alive, false);
  assert.equal(P(g, 4).alive, true);
});

void test('Atheist: everyone is good, the Storyteller can be nominated, and executing them wins for good', () => {
  const g = game(['atheist', 'astronaut', 'insomniac', 'spirit', 'diviner']);
  assert.deepEqual(order(g), [
    'astronaut:2',
    'diviner:5',
    'spirit:4',
    'insomniac:3',
  ]);
  finishNight(g);
  execute(
    g,
    host,
    { action: 'overridePhase', phase: 'nomination', reason: 'testing' },
    later(),
  );
  execute(
    g,
    { id: P(g, 2).id, host: false },
    { action: 'nominate', target: 'storyteller' },
    later(),
  );
  assert.equal(g.active?.target, 'storyteller');
  execute(g, host, { action: 'advance' }, later());
  for (const p of g.players.slice(1))
    execute(
      g,
      { id: p.id, host: false },
      { action: 'vote', yes: true },
      later(),
    );
  execute(
    g,
    { id: P(g, 1).id, host: false },
    { action: 'vote', yes: true },
    later(),
  );
  execute(g, host, { action: 'advance' }, later());
  assert.equal(g.phase, 'dayReview');
  execute(g, host, { action: 'execute', target: 'storyteller' }, later());
  assert.equal(g.phase, 'ended');
  assert.match(g.winner, /Good/);
});

void test('a Lost Soul acts as a hidden Villager without learning which', () => {
  const g = game(
    [
      'lostsoul',
      'astronaut',
      'insomniac',
      'diviner',
      'spirit',
      'priest',
      'necromancer',
      'miasma',
    ],
    { 0: 'astrologist' },
  );
  const v = view(g, { id: P(g, 1).id, host: false }, 1, clock);
  assert.equal(v.character?.name, 'Lost Soul');
  assert.equal(v.nightChoice?.label, 'Choose 3 different players');
  assert.ok(order(g).includes('astrologist:1'));
  assert.equal(P(g, 1).drunk, true);
});

void test('a Lost Soul receives only minimal values and no correctness confirmation', () => {
  const g = game(
    [
      'lostsoul',
      'astronaut',
      'insomniac',
      'diviner',
      'spirit',
      'priest',
      'nightmare',
      'dreameater',
    ],
    { 0: 'prophet' },
  );
  while (tasks(g).find((t) => !t.done)!.role !== 'prophet') step(g);
  resolve(g, { info: 'Dreameater, Nightmare' });
  assert.equal(lastMessage(g, 1), 'Dreameater, Nightmare');
  assert.doesNotMatch(lastMessage(g, 1), /Prophet|correct|in play/i);
});

void test('Spirit learns visitor alignments, never the chosen player alignment', () => {
  const g = game([
    'fateweaver',
    'spirit',
    'insomniac',
    'priest',
    'diviner',
    'zealot',
    'nightmare',
    'miasma',
  ]);
  const task = {
    key: 'spirit:' + P(g, 2).id,
    role: 'spirit',
    player: P(g, 2).id,
    name: 'Spirit',
    done: false,
  };
  g.hms!.visits = [
    { from: P(g, 3).id, to: P(g, 4).id, role: 'insomniac' },
    { from: P(g, 8).id, to: P(g, 4).id, role: 'miasma' },
  ];
  assert.equal(
    suggestions(g, task, { id: '', target: P(g, 4).id, target2: '' }),
    '1 evil\n1 good',
  );
  g.hms!.visits = [];
  assert.equal(
    suggestions(g, task, { id: '', target: P(g, 4).id, target2: '' }),
    '0 people.',
  );
  P(g, 2).alive = false;
  g.hms!.visits = [
    { from: P(g, 3).id, to: P(g, 4).id, role: 'insomniac' },
    { from: P(g, 8).id, to: P(g, 4).id, role: 'miasma' },
  ];
  assert.equal(
    suggestions(g, task, { id: '', target: P(g, 4).id, target2: '' }),
    '2 people.',
  );
});

void test('Nightmare gets a fresh 60-second prompt after the haunted target chooses and all responses close early', () => {
  const g = game(['astronaut', 'prophet', 'spirit', 'nightmare', 'miasma']);
  g.hms!.nightmare = {
    player: P(g, 4).id,
    bound: P(g, 3).id,
    used: false,
  };
  assert.equal(nightChoiceTask(g, P(g, 4).id), null);
  choose(g, 5, { target: P(g, 1).id });
  const originalDeadline = g.nightChoiceDeadline!;
  choose(g, 3, { target: P(g, 2).id });
  const redirect = nightChoiceTask(g, P(g, 4).id)!;
  const deadline = g.nightChoiceDeadlines![redirect.key];
  assert.equal(deadline, originalDeadline - 1 + 60000);
  assert.equal(nightChoicesReady(g, originalDeadline + 1), false);
  assert.throws(
    () =>
      execute(
        g,
        host,
        { action: 'nightSkip', reason: 'Nightmare is still deciding' },
        originalDeadline + 1,
      ),
    /timer to finish/,
  );
  choose(g, 4, { pass: true });
  assert.equal(g.nightChoiceDeadline, deadline - 1);
  assert.equal(nightChoicesReady(g, deadline - 1), true);
});

void test('a Prophet reveal queues deaths for the night; rewind restores the script state', () => {
  const g = game(EIGHT);
  finishNight(g);
  execute(
    g,
    host,
    { action: 'prophetReveal', player: P(g, 5).id, neighbor: P(g, 4).id },
    later(),
  );
  assert.equal(g.hms!.deathQueue.length, 2);
  assert.equal(pendingDeath(g), null);
  execute(g, host, { action: 'undo' }, later());
  assert.equal(g.hms!.deathQueue.length, 0);
  execute(g, host, { action: 'prophetReveal', player: P(g, 5).id }, later());
  toNight(g);
  finishNight(g);
  assert.equal(P(g, 5).alive, false);
});
