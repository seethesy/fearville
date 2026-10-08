// Holy Moon and Stars rules. Classic games never enter this module.
//
// Order of operations for any death (see resolveDeath):
//   1. Targeting: Dazed and Nightmare redirects are applied when the
//      ability resolves, so a queued death already names the final target.
//   2. Prevention: Extra Life, then the Celestial (day only).
//   3. Fateweaver: may move a remaining death once; the new target is queued
//      again and passes through prevention again.
//   4. Death, then triggers: Constellation link, Zealot, Priest self-revival,
//      Celestial execution, Nightmare execution, Moonshiner.
import {
  role,
  scriptRoles,
  uuid,
  COUNTS,
  HMS_FIRST,
  HMS_OTHER,
  HMS_ROLES,
  type Game,
  type Player,
  type Command,
  type HmsState,
  type DeathItem,
  type NightChoice,
} from './types.ts';
import { deliverIntroduction } from './introductions.ts';
import {
  isHof,
  hofTasks,
  hofChoiceSpec,
  hofSetupIssues,
  hofStartState,
  hofBeginNight,
  hofResolve,
  hofPrevented,
  guardianFor,
  validateHofTriggers,
  hofAfterKill,
  hofDawn,
  hofWinHints,
  hofAction,
  bluffIssue,
} from './hof.ts';
import {
  requireThat,
  person,
  nameOf,
  log,
  message,
  healthy,
  evil,
  alignment,
} from './engine.ts';

// The queued engine: Holy Moon and Stars and Horrors of Fearville share
// night tasks with player choices, visits, the death queue and dawn changes.
// isMoon is Holy Moon and Stars only.
export const isHms = (g: Game) =>
  g.script === 'holyMoonStars' || g.script === 'horrors';
export const isMoon = (g: Game) => g.script === 'holyMoonStars';
export const ST = 'storyteller';

export function hms(g: Game): HmsState {
  g.hms ??= {
    visits: [],
    nightStartDead: [],
    deathQueue: [],
    dawnChanges: [],
    stargazer: {},
    astrologist: {},
    questions: {},
  };
  return g.hms;
}

export type Task = {
  key: string;
  role: string;
  player: string;
  name: string;
  done: boolean;
};

// The character whose night slot a player takes. A Lost Soul acts as a
// hidden Villager; the Drunk, Dazed and Moonshiner Fools act as their shown
// Villager.
export const actsAs = (p: Player) => p.acts || p.shown || p.role;
export const team = (id: string) => role(id)?.team ?? '';
export const isGood = (p: Player) => !evil(p);
export const atheistInPlay = (g: Game) =>
  g.players.some((p) => p.role === 'atheist');
const roleName = (id: string) => role(id)?.name ?? id;

// Abilities that choose players. These are "visits" and can be redirected by
// the Dazed or the Nightmare.
export const TARGETING = [
  'constellation',
  'stargazer',
  'astrologist',
  'mystic',
  'medium',
  'gravedigger',
  'priest',
  'necromancer',
  'spirit',
  'miasma',
  'grimreaper',
  'werewolf',
  'nightmare',
  // Horrors of Fearville
  'basilisk',
  'lostwanderer',
  'doctor',
  'monster',
  'wraith',
  'detective',
  'judge',
  'watchman',
  'mortician',
  'psychic',
];
// Abilities the Medium can grant to a dead player. Start-of-game abilities
// count as already used, so those players only receive the channel.
const GRANTABLE = [
  'insomniac',
  'diviner',
  'spirit',
  'gravedigger',
  'priest',
  'necromancer',
  'medium',
  'miasma',
  'grimreaper',
  'werewolf',
  'dreameater',
];
const ONCE = ['gravedigger', 'priest', 'necromancer'];
export const targetCount = (r: string, g: Game) =>
  r === 'constellation' || r === 'astrologist'
    ? 3
    : r === 'detective' || r === 'judge'
      ? 2
      : r === 'werewolf'
        ? g.night % 3 === 0
          ? 3
          : 0
        : [
              'diviner',
              'insomniac',
              'astronaut',
              'prophet',
              'dreameater',
              'guess',
            ].includes(r)
          ? 0
          : TARGETING.includes(r) || r === 'nightmareRedirect'
            ? 1
            : 0;

// The Storyteller's own seat once a Zealot grants them an ability. It cannot
// be targeted and never appears in the player list.
export function stActor(g: Game): Player | null {
  const r = g.hms?.stRole;
  if (!r) return null;
  return {
    id: ST,
    name: 'Storyteller',
    seat: 0,
    role: r,
    shown: r,
    alive: true,
    publicAlive: true,
    ghost: true,
    poisoned: false,
    protected: false,
    master: '',
    used: !!g.hms?.stUsed,
    nightDeath: 0,
    notes: '',
  };
}
export const actorOf = (g: Game, id: string) =>
  id === ST ? stActor(g)! : person(g, id);
export const ok = (p: Player) => p.id === ST || healthy(p);

export function seats(g: Game) {
  return g.players.filter((p) => !p.departed).sort((a, b) => a.seat - b.seat);
}
// Nearest living neighbors in seat order (one each way).
export function livingNeighbors(g: Game, p: Player) {
  const s = seats(g);
  const at = s.findIndex((q) => q.id === p.id);
  if (at < 0) return [];
  const found: Player[] = [];
  for (const dir of [1, -1]) {
    for (let i = 1; i < s.length; i++) {
      const q = s[(at + dir * i + s.length * i) % s.length];
      if (q.id === p.id) break;
      if (q.alive) {
        if (!found.includes(q)) found.push(q);
        break;
      }
    }
  }
  return found;
}
export function seatNeighbors(g: Game, p: Player) {
  const s = seats(g);
  const at = s.findIndex((q) => q.id === p.id);
  if (at < 0 || s.length < 2) return [];
  return [
    ...new Set([s[(at + 1) % s.length], s[(at - 1 + s.length) % s.length]]),
  ];
}
export function evilDistance(g: Game, p: Player) {
  const s = seats(g);
  const at = s.findIndex((q) => q.id === p.id);
  let best = Infinity;
  s.forEach((q, i) => {
    if (q.id === p.id || !evil(q)) return;
    const d = Math.abs(i - at);
    best = Math.min(best, d, s.length - d);
  });
  return best;
}

// ---------------------------------------------------------------- tasks

export function taskFor(r: string, p: Player, done: string[]): Task {
  return {
    key: r + ':' + p.id,
    role: r,
    player: p.id,
    name:
      (p.id === ST ? 'Storyteller (Zealot)' : role(r)?.name + ' · ' + p.name) +
      (p.role === 'lostsoul' && p.acts === r ? ' (Lost Soul)' : ''),
    done: done.includes(r + ':' + p.id),
  };
}
function canAct(g: Game, p: Player, r: string) {
  const s = hms(g);
  if (ONCE.includes(r) && p.used) return false;
  if ((ONCE.includes(r) || r === 'medium') && !s.nightStartDead.length)
    return false;
  if (r === 'werewolf' || r === 'spirit') return p.alive || r === 'spirit';
  if (p.alive) return true;
  return (
    s.medium?.night === g.night &&
    s.medium.target === p.id &&
    GRANTABLE.includes(r)
  );
}
export function hmsTasks(g: Game): Task[] {
  if (isHof(g)) return hofTasks(g);
  const s = hms(g);
  const order = g.night === 1 ? HMS_FIRST : HMS_OTHER;
  const st = stActor(g);
  const out: Task[] = [];
  const special = (key: string, name: string, player = '') =>
    out.push({
      key,
      role: key.split(':')[0],
      player,
      name,
      done: g.done.includes(key),
    });
  const nightmare = s.nightmare;
  const nightmarePlan = nightmare
    ? g.nightChoices?.['nightmareRedirect:' + nightmare.player]
    : undefined;
  if (nightmare && nightmarePlan && !nightmarePlan.pass && !nightmare.used)
    special(
      'nightmareRuling:' + nightmare.player,
      'Resolve Nightmare redirect',
      nightmare.player,
    );
  for (const r of order) {
    if (r === 'minioninfo' || r === 'demoninfo') {
      if (g.players.length >= 7 && !atheistInPlay(g))
        special(
          r,
          r === 'minioninfo' ? 'Haunt introductions' : 'Horror introductions',
        );
      continue;
    }
    if (r === 'plague') {
      if (s.infected && s.infected.night === g.night - 1)
        special('plague', 'Plague · ' + nameOf(g, s.infected.target));
      continue;
    }
    if (r === 'nightmare') {
      const n = s.nightmare;
      if (n && !n.bound)
        special(
          'nightmare:' + n.player,
          'Nightmare · ' + nameOf(g, n.player),
          n.player,
        );
      continue;
    }
    if (r === 'guess') {
      const c = s.constellation;
      const owner = c && g.players.find((p) => p.id === c.owner);
      if (
        c?.linked &&
        owner?.alive &&
        !owner.used &&
        actsAs(owner) === 'constellation'
      )
        special(
          'guess:' + owner.id,
          'Constellation guess · ' + owner.name,
          owner.id,
        );
      continue;
    }
    if (r === 'deaths') {
      if (s.deathQueue.some((d) => d.night) || g.done.includes('deaths'))
        special('deaths', 'Resolve night deaths');
      continue;
    }
    for (const p of seats(g))
      if (actsAs(p) === r && canAct(g, p, r)) out.push(taskFor(r, p, g.done));
    if (
      st &&
      st.role === r &&
      g.night > (s.stNight ?? 0) &&
      (!ONCE.includes(r) || !s.stUsed)
    )
      out.push(taskFor(r, st, g.done));
  }
  return out;
}

// What a player may submit during the night-choice window.
export type ChoiceSpec = {
  count: number;
  text: boolean;
  guesses: 'free' | 'members' | null;
  members: string[];
  optional: boolean;
  label: string;
  flag?: string; // label of an optional yes/no the player may tick
  eligible: (q: Player) => boolean;
};
export function choiceSpec(g: Game, t: Task): ChoiceSpec | null {
  const s = hms(g);
  const me = g.players.find((p) => p.id === t.player);
  if (!me || me.departed) return null;
  const living = (q: Player) => q.publicAlive && !q.departed;
  const dead = (q: Player) => !q.publicAlive && !q.departed;
  const notMe = (q: Player) => q.id !== me.id;
  const base = {
    count: targetCount(t.role, g),
    text: false,
    guesses: null as ChoiceSpec['guesses'],
    members: [] as string[],
    optional: false,
  };
  const r = t.role;
  if (isHof(g)) return hofChoiceSpec(g, t, me, base);
  // A Lost Soul never learns which ability it is using.
  const lost = me.role === 'lostsoul';
  const pick = (n: number) =>
    `Choose ${n === 1 ? 'a player' : n + ' different players'}`;
  switch (r) {
    case 'constellation':
      return {
        ...base,
        label: lost
          ? pick(3)
          : 'Choose 3 players to form your Constellation (you may include yourself).',
        eligible: living,
      };
    case 'astrologist':
      return {
        ...base,
        label: lost ? pick(3) : 'Choose 3 players to read in the stars.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'stargazer':
      return {
        ...base,
        label: lost
          ? pick(1)
          : 'Choose a player to watch for the rest of the game.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'mystic': {
      const near = seatNeighbors(g, me).map((q) => q.id);
      return {
        ...base,
        label: lost ? pick(1) : 'Choose one of your neighbors.',
        eligible: (q) => near.includes(q.id),
      };
    }
    case 'spirit':
      return {
        ...base,
        label: lost ? pick(1) : 'Choose a player to watch tonight.',
        eligible: (q) => !q.departed && notMe(q),
      };
    case 'medium':
      return {
        ...base,
        label: lost ? pick(1) : 'Choose a dead player to reach tonight.',
        eligible: dead,
      };
    case 'gravedigger':
    case 'priest':
    case 'necromancer':
      if (!s.nightStartDead.length) return null;
      return {
        ...base,
        optional: true,
        label: lost
          ? pick(1) + ', or pass.'
          : `Once per game: choose a dead player to ${r === 'gravedigger' ? 'take the character of' : 'bring back at dawn'}, or pass to save it.`,
        eligible: dead,
      };
    case 'diviner':
      return {
        ...base,
        text: true,
        label: lost
          ? 'Ask the Storyteller a question.'
          : 'Ask the Storyteller a question. They will name a player to speak to.',
        eligible: () => false,
      };
    case 'guess':
      return {
        ...base,
        guesses: 'members',
        members: s.constellation?.members ?? [],
        optional: true,
        label:
          'Once per game: guess every member’s character, or pass to wait.',
        eligible: () => false,
      };
    case 'miasma':
      return {
        ...base,
        label: 'Choose a player to infect with the plague.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'grimreaper':
      return {
        ...base,
        label: 'Choose a player to mark for death.',
        eligible: (q) => living(q) && notMe(q) && !q.marked,
      };
    case 'werewolf':
      if (!base.count) return null;
      return {
        ...base,
        label: 'The full moon rises: choose 3 players to die.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'dreameater':
      return {
        ...base,
        guesses: 'free',
        optional: true,
        label:
          'Guess any number of players’ characters. Three wrong guesses in total kill you.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'nightmare':
      return {
        ...base,
        label: 'Choose a player with a nighttime targeting ability to haunt.',
        eligible: (q) => living(q),
      };
    case 'nightmareRedirect':
      return {
        ...base,
        optional: true,
        label: `${nameOf(g, s.nightmare?.bound ?? '')} chose a player. Redirect their ability to a different player (once per game), or pass:`,
        eligible: living,
      };
  }
  return null;
}
// Tasks each player may answer during the night-choice window.
export function choiceTasks(g: Game) {
  const list = hmsTasks(g).filter((t) => t.player && t.player !== ST);
  return list.filter((t) => {
    const p = g.players.find((q) => q.id === t.player)!;
    return (
      p.alive || ['spirit', 'nightmare', 'nightmareRedirect'].includes(t.role)
    );
  });
}

const NIGHTMARE_DECISION_MS = 60_000;
export function nightChoiceDeadlineFor(g: Game, t: Pick<Task, 'key'>) {
  if (g.sandbox) return Number.MAX_SAFE_INTEGER;
  return g.nightChoiceDeadlines?.[t.key] ?? g.nightChoiceDeadline ?? 0;
}
function openNightmareDecision(g: Game, now: number) {
  const n = hms(g).nightmare;
  if (!n?.bound || n.used || !g.nightChoices) return;
  const boundChoice = Object.entries(g.nightChoices).find(([key, choice]) => {
    const task = g.nightChoiceTasks?.find((t) => t.key === key);
    return (
      task?.player === n.bound && TARGETING.includes(task.role) && !choice.pass
    );
  });
  const nightmare = g.players.find((p) => p.id === n.player);
  if (!boundChoice || !nightmare || nightmare.departed) return;
  const key = 'nightmareRedirect:' + nightmare.id;
  if (!g.nightChoiceTasks?.some((t) => t.key === key))
    g.nightChoiceTasks?.push({
      key,
      role: 'nightmareRedirect',
      player: nightmare.id,
      name: 'Nightmare redirect · ' + nightmare.name,
      done: false,
    });
  g.nightChoiceDeadlines ??= {};
  g.nightChoiceDeadlines[key] ??= now + NIGHTMARE_DECISION_MS;
}
export function afterNightChoice(g: Game, t: Task, now: number) {
  const n = hms(g).nightmare;
  if (n?.bound === t.player && TARGETING.includes(t.role))
    openNightmareDecision(g, now);
  if (nightChoicesReady(g, now)) g.nightChoiceDeadline = now;
}
export function nightChoicesReady(g: Game, now: number) {
  if (g.sandbox) return true;
  if (!isHms(g))
    return g.nightChoiceDeadline === undefined || now >= g.nightChoiceDeadline;
  return (g.nightChoiceTasks ?? []).every((t) => {
    if (!choiceSpec(g, t)) return true;
    return !!g.nightChoices?.[t.key] || now >= nightChoiceDeadlineFor(g, t);
  });
}
export function nightChoiceWindowDeadline(g: Game) {
  const pending = (g.nightChoiceTasks ?? [])
    .filter((t) => choiceSpec(g, t) && !g.nightChoices?.[t.key])
    .map((t) => nightChoiceDeadlineFor(g, t));
  return pending.length ? Math.max(...pending) : (g.nightChoiceDeadline ?? 0);
}
export function validateChoice(g: Game, t: Task, c: Command): NightChoice {
  const spec = choiceSpec(g, t);
  requireThat(spec, 'This night choice is no longer available.');
  const choice: NightChoice = { id: uuid(), target: '', target2: '' };
  if (c.pass === true) {
    requireThat(spec.optional, 'This choice cannot be skipped.');
    return { ...choice, pass: true };
  }
  const ids = [c.target, c.target2, c.target3]
    .slice(0, spec.count)
    .map((v) => clean(v));
  if (spec.count) {
    requireThat(
      new Set(ids).size === spec.count &&
        ids.every((id) =>
          g.players.some((p) => p.id === id && spec.eligible(p)),
        ),
      spec.count === 1
        ? 'Choose an eligible player.'
        : `Choose ${spec.count} different eligible players.`,
    );
    [choice.target, choice.target2, choice.target3 = ''] = [
      ids[0],
      ids[1] ?? '',
      ids[2] ?? '',
    ];
  }
  if (spec.flag) choice.flag = c.flag === true;
  if (spec.text) {
    const text = clean(c.text, 500);
    requireThat(text, 'Write your question.');
    choice.text = text;
  }
  if (spec.guesses) {
    const raw = Array.isArray(c.guesses) ? c.guesses.slice(0, 15) : [];
    const guesses = raw.map((x: { player?: unknown; role?: unknown }) => ({
      player: clean(x?.player),
      role: clean(x?.role),
    }));
    requireThat(
      guesses.every(
        (x) =>
          HMS_ROLES.some((r) => r.id === x.role) &&
          (spec.guesses === 'members'
            ? spec.members.includes(x.player)
            : g.players.some((p) => p.id === x.player && spec.eligible(p))),
      ) && new Set(guesses.map((x) => x.player)).size === guesses.length,
      'Guess one character per player.',
    );
    if (spec.guesses === 'members')
      requireThat(
        guesses.length === spec.members.length,
        'Guess a character for every member.',
      );
    else requireThat(guesses.length > 0, 'Make at least one guess, or pass.');
    choice.guesses = guesses;
  }
  return choice;
}

// ---------------------------------------------------------------- setup

export function hmsSetupIssues(g: Game) {
  if (isHof(g)) return hofSetupIssues(g);
  const issues: string[] = [];
  const counts = COUNTS[g.players.length]?.slice();
  if (!counts) return ['Holy Moon and Stars requires 5–18 players.'];
  const ids = g.players.map((p) => p.role);
  if (g.players.some((p) => !HMS_ROLES.some((r) => r.id === p.role)))
    issues.push('Assign a Holy Moon and Stars character to every seat.');
  const atheist = ids.includes('atheist');
  const expected = atheist
    ? [g.players.length - counts[1], counts[1], 0, 0]
    : counts;
  if (!atheist && ids.includes('moonshiner')) {
    expected[0] -= 1;
    expected[1] += 1;
  }
  const actual = ['townsfolk', 'outsider', 'minion', 'demon'].map(
    (t) => g.players.filter((p) => team(p.role) === t).length,
  );
  if (actual.some((v, i) => v !== expected[i]))
    issues.push(
      atheist
        ? `With an Atheist every player is good: expected ${expected[0]} Villagers and ${expected[1]} Fools.`
        : `Expected ${expected[0]} Villagers, ${expected[1]} Fools, ${expected[2]} Haunts and 1 Horror.`,
    );
  if (new Set(ids).size !== ids.length)
    issues.push('Characters must be unique at setup.');
  const outOfPlayVillager = (id: string | undefined) =>
    !!id &&
    team(id) === 'townsfolk' &&
    HMS_ROLES.some((r) => r.id === id) &&
    !ids.includes(id);
  const hidden: string[] = [];
  const moon = ids.includes('moonshiner');
  for (const p of g.players) {
    if (p.role === 'lostsoul') {
      if (!outOfPlayVillager(p.acts))
        issues.push(
          `Give ${p.name} (Lost Soul) a hidden out-of-play Villager.`,
        );
      else hidden.push(p.acts!);
      if (p.shown !== 'lostsoul' && !(moon && outOfPlayVillager(p.shown)))
        issues.push(`${p.name} (Lost Soul) should be shown the Lost Soul.`);
    } else if (p.role === 'dazed' || (moon && team(p.role) === 'outsider')) {
      if (!outOfPlayVillager(p.shown))
        issues.push(
          `Show ${p.name} (${roleName(p.role)}) an out-of-play Villager.`,
        );
      else hidden.push(p.shown);
    } else if (p.shown && p.shown !== p.role)
      issues.push(`${p.name} should be shown their own character.`);
  }
  if (new Set(hidden).size !== hidden.length)
    issues.push(
      'Each drunk or Lost Soul player needs a different out-of-play Villager.',
    );
  const bluffs = atheist
    ? ''
    : bluffIssue(
        g,
        HMS_ROLES.filter(
          (r) =>
            ['townsfolk', 'outsider'].includes(r.team) && r.id !== 'atheist',
        ).map((r) => r.id),
      );
  if (bluffs) issues.push(bluffs);
  return issues;
}
// Fill in hidden characters after any (random or manual) deal.
export function applyStartState(g: Game, c: Command = { action: 'start' }) {
  if (isHof(g)) return hofStartState(g, c);
  const moon = g.players.some((p) => p.role === 'moonshiner');
  for (const p of g.players) {
    p.drunk =
      p.role === 'dazed' ||
      p.role === 'lostsoul' ||
      (moon && team(p.role) === 'outsider');
    if (p.role !== 'lostsoul') delete p.acts;
  }
  g.hms = undefined;
  hms(g);
}

// ---------------------------------------------------------------- night

export function hmsBeginNight(g: Game) {
  const s = hms(g);
  s.visits = [];
  s.questions = {};
  s.prophetReveal = undefined;
  s.nightStartDead = g.players.filter((p) => !p.alive).map((p) => p.id);
  delete s.medium;
  for (const p of g.players) {
    p.poisoned = !!p.poisonUntil && p.poisonUntil > g.night;
    if (!p.poisoned) delete p.poisonUntil;
  }
  if (isHof(g)) hofBeginNight(g);
}
export function visit(
  g: Game,
  from: string,
  to: string,
  r: string,
  hidden = false,
) {
  const s = hms(g);
  const v = {
    from,
    to,
    role: r,
    night: g.night,
    ...(hidden ? { hidden } : {}),
  };
  s.visits.push(v);
  if (isHof(g)) (s.history ??= []).push(v);
}

export function enqueueDeath(
  g: Game,
  player: string,
  cause: string,
  opts: Partial<DeathItem> = {},
  front = false,
) {
  const item: DeathItem = {
    id: uuid(),
    player,
    cause,
    ready: g.phase !== 'night' || g.done.includes('deaths'),
    night: g.phase === 'night',
    ...opts,
  };
  const q = hms(g).deathQueue;
  if (front) q.unshift(item);
  else q.push(item);
  return item;
}
export const pendingDeath = (g: Game) =>
  g.hms?.deathQueue.find((d) => d.ready) ?? null;
export function requireNoPendingDeath(g: Game) {
  requireThat(!pendingDeath(g), 'Resolve the pending death first.');
}

function clean(x: unknown, max = 500) {
  return (typeof x === 'string' || typeof x === 'number' ? String(x) : '')
    .trim()
    .slice(0, max);
}
const overridden = (c: Command) => !!c.override;
function enforce(condition: unknown, text: string, c: Command) {
  requireThat(
    condition || overridden(c),
    text + ' Use a Storyteller override if needed.',
  );
}

// Infer what a player is connected to, for the Mystic's suggestion.
export function connections(g: Game, p: Player) {
  const s = hms(g);
  const ids = new Set<string>();
  const r = p.role;
  if (s.astrologist[p.id]) s.astrologist[p.id].forEach((id) => ids.add(id));
  if (s.stargazer[p.id]) ids.add(s.stargazer[p.id]);
  if (s.constellation?.owner === p.id)
    s.constellation.members.forEach((id) => ids.add(id));
  if (s.constellation?.members.includes(p.id))
    s.constellation.members.forEach((id) => ids.add(id));
  if (team(r) === 'demon')
    g.players
      .filter((q) => team(q.role) === 'minion')
      .forEach((q) => ids.add(q.id));
  if (team(r) === 'minion')
    g.players.filter((q) => evil(q)).forEach((q) => ids.add(q.id));
  if (s.infected?.by === p.id) ids.add(s.infected.target);
  ids.delete(p.id);
  return [...ids];
}
export function suggestions(g: Game, t: Task, choice?: NightChoice | null) {
  const s = hms(g);
  const p = actorOf(g, t.player);
  const target = choice?.target
    ? g.players.find((q) => q.id === choice.target)
    : null;
  switch (t.role) {
    case 'astronaut': {
      const d = evilDistance(g, p);
      return d === Infinity ? 'none' : String(d);
    }
    case 'prophet':
      return (
        g.players
          .filter((q) => ['minion', 'demon'].includes(team(q.role)))
          .map((q) => roleName(q.role))
          .join(', ') || 'none'
      );
    case 'insomniac': {
      const visitors = s.visits.filter((v) => v.to === p.id && v.from !== p.id);
      const names = [
        ...new Set(
          visitors.map((v) =>
            v.from === ST ? 'an unseen visitor' : nameOf(g, v.from),
          ),
        ),
      ];
      const near = livingNeighbors(g, p);
      const out = near.filter((n) =>
        s.visits.some((v) => v.from === n.id && v.to !== n.id),
      ).length;
      return `Visited by: ${names.join(', ') || 'nobody'}. Neighbors who visited someone: ${out}.`;
    }
    case 'spirit': {
      if (!target) return '';
      const visitorIds = [
        ...new Set(
          s.visits
            .filter(
              (v) => v.to === target.id && v.from !== p.id && v.from !== ST,
            )
            .map((v) => v.from),
        ),
      ];
      if (!visitorIds.length) return '0 people.';
      if (!p.alive)
        return `${visitorIds.length} ${visitorIds.length === 1 ? 'person' : 'people'}.`;
      const visitors = visitorIds.map((id) => person(g, id));
      const bad = visitors.filter(evil).length;
      return `${bad} evil\n${visitors.length - bad} good`;
    }
    case 'mystic':
      return target
        ? connections(g, target)
            .slice(0, 3)
            .map((id) => nameOf(g, id))
            .join(', ')
        : '';
  }
  return '';
}
export function astrologistSuggestion(g: Game, ids: string[]) {
  const inPlay = new Set(g.players.map((p) => p.role));
  const owner = g.players.find((p) => ids.includes(p.id));
  const others = HMS_ROLES.filter((r) => !inPlay.has(r.id)).map((r) => r.id);
  return [owner?.role ?? '', others[0] ?? '', others[1] ?? ''];
}

// Resolve the current night task. Returns the Storyteller summary.
export function hmsResolve(g: Game, t: Task, c: Command, now: number): string {
  const s = hms(g);
  requireNoPendingDeath(g);
  const r = t.role;
  if (r === 'minioninfo' || r === 'demoninfo') {
    const text = deliverIntroduction(g, r, now);
    g.done.push(t.key);
    return text;
  }
  if (r === 'plague') {
    const inf = s.infected!;
    const victim = person(g, inf.target);
    const near = livingNeighbors(g, victim);
    for (const n of near) {
      n.poisoned = true;
      n.poisonUntil = Math.max(n.poisonUntil ?? 0, g.night + 1);
    }
    delete s.infected;
    g.done.push(t.key);
    if (victim.alive) enqueueDeath(g, victim.id, 'plague', { ready: true });
    const summary = `The plague claims ${victim.name}. Poisoned tonight: ${near.map((n) => n.name).join(', ') || 'nobody'}. Resolve the death before continuing.`;
    log(g, summary, now);
    return summary;
  }
  if (r === 'deaths') {
    s.deathQueue.forEach((d) => (d.ready = true));
    g.done.push(t.key);
    const summary = s.deathQueue.length
      ? `Resolve ${s.deathQueue.length} queued death${s.deathQueue.length === 1 ? '' : 's'}.`
      : 'No queued deaths tonight.';
    log(g, summary, now);
    return summary;
  }
  if (r === 'nightmareRuling') {
    const nightmare = s.nightmare;
    const plan = nightmare
      ? g.nightChoices?.['nightmareRedirect:' + nightmare.player]
      : undefined;
    requireThat(
      nightmare && plan && !plan.pass,
      'No Nightmare redirect remains.',
    );
    const target = person(g, clean(c.target) || plan.target);
    s.nightmareRedirectTarget = target.id;
    nightmare.used = true;
    g.done.push(t.key);
    const summary = `Nightmare redirects the haunted ability to ${target.name}.`;
    log(g, summary, now);
    return summary;
  }
  const p = actorOf(g, t.player);
  const choice = g.nightChoices?.[t.key];
  const fine = ok(p);
  const isST = p.id === ST;
  const lost = p.role === 'lostsoul';
  // Targets as chosen, then where they actually land.
  const count = r === 'guess' ? 0 : targetCount(r, g);
  const chosen = ['target', 'target2', 'target3']
    .slice(0, count)
    .map((k) => clean(c[k]));
  const pass =
    c.pass === true ||
    (count > 0 &&
      chosen.every((x) => !x) &&
      ['gravedigger', 'priest', 'necromancer', 'mortician'].includes(r));
  const hits = chosen;
  let redirectNote = '';
  if (count && !pass) {
    requireThat(
      chosen.every((x) => g.players.some((q) => q.id === x)),
      `Choose ${count === 1 ? 'the target' : count + ' targets'}.`,
    );
    requireThat(
      new Set(chosen).size === chosen.length,
      'Choose different players.',
    );
    const original = [choice?.target, choice?.target2, choice?.target3].slice(
      0,
      count,
    );
    if (original.some((target, i) => target && target !== hits[i]))
      redirectNote = ` Redirected privately: ${original
        .map((target, i) =>
          target && target !== hits[i]
            ? `${nameOf(g, target)} → ${nameOf(g, hits[i])}`
            : '',
        )
        .filter(Boolean)
        .join(', ')}.`;
    // A Wraith may choose not to be detected visiting.
    const hidden = r === 'wraith' && c.hidden === true;
    if (TARGETING.includes(r))
      hits.forEach((h) => visit(g, p.id, h, r, hidden));
  }
  const H = hits.map((h) => g.players.find((q) => q.id === h)!);
  let info = '';
  let summary = '';
  const send = (text: string, minimal = text) => {
    const delivered = lost ? minimal : text;
    if (!isST) message(g, p.id, delivered, now);
    info = delivered;
  };
  const once = () => {
    if (isST) s.stUsed = true;
    else p.used = true;
  };
  if (isHof(g))
    summary = hofResolve(g, t, c, {
      p,
      H,
      choice,
      fine,
      pass,
      send: (text) => send(text),
      once,
    });
  // Horrors of Fearville abilities resolved above.
  switch (isHof(g) ? 'hof' : r) {
    case 'hof':
      break;
    case 'constellation': {
      const members = hits;
      s.constellation = { owner: p.id, members, linked: fine };
      send(
        `Your Constellation: ${H.map((q) => q.name).join(', ')}.`,
        H.map((q) => q.name).join(', '),
      );
      summary = `Constellation linked ${H.map((q) => q.name).join(', ')}${fine ? '' : ' (impaired: no link)'}.`;
      break;
    }
    case 'stargazer':
      s.stargazer[p.id] = hits[0];
      send(
        `You are watching ${H[0].name}. Ask the Storyteller about them at any time.`,
        H[0].name,
      );
      summary = `Stargazer watches ${H[0].name}.`;
      break;
    case 'astrologist': {
      s.astrologist[p.id] = hits;
      const shown = ['reveal1', 'reveal2', 'reveal3'].map((k) => clean(c[k]));
      requireThat(
        shown.every((x) => role(x)) && new Set(shown).size === 3,
        'Choose three different characters.',
      );
      const inPlay = new Set(g.players.map((q) => q.role));
      const owned = shown.filter((x) => H.some((q) => q.role === x)).length;
      const absent = shown.filter((x) => !inPlay.has(x)).length;
      enforce(
        !fine || (owned === 1 && absent === 2),
        'Exactly one character must belong to a chosen player and two must be out of play.',
        c,
      );
      send(
        `One of these characters belongs to one of ${H.map((q) => q.name).join(', ')}: ${shown.map(roleName).join(', ')}.`,
        shown.map(roleName).join(', '),
      );
      summary = info;
      break;
    }
    case 'mystic': {
      enforce(
        seatNeighbors(g, p).some((q) => q.id === hits[0]),
        'The Mystic must choose a neighbor.',
        c,
      );
      const links = ['link1', 'link2', 'link3']
        .map((k) => clean(c[k]))
        .filter(Boolean);
      requireThat(
        links.every((id) => g.players.some((q) => q.id === id)) &&
          new Set(links).size === links.length,
        'Choose different players.',
      );
      send(
        links.length
          ? `${H[0].name} may be connected to ${links.map((id) => nameOf(g, id)).join(', ')}.`
          : `You sense no connections around ${H[0].name}.`,
        links.length ? links.map((id) => nameOf(g, id)).join(', ') : 'Nobody',
      );
      summary = info;
      break;
    }
    case 'astronaut':
    case 'prophet':
    case 'insomniac':
    case 'spirit': {
      const suggested = suggestions(g, t, {
        id: '',
        target: hits[0] ?? '',
        target2: '',
      });
      const given = clean(c.info, 2000) || suggested;
      enforce(
        !fine || !clean(c.info, 2000) || given === suggested,
        'This differs from the calculated information.',
        c,
      );
      const text =
        r === 'astronaut'
          ? given === 'none'
            ? 'There is no evil player near you.'
            : `The nearest evil player is ${given} seat${given === '1' ? '' : 's'} from you.`
          : r === 'prophet'
            ? `Haunt and Horror characters in play: ${given}.`
            : given;
      const minimal =
        r === 'insomniac'
          ? given
              .replace(/^Visited by: /, '')
              .replace(/\. Neighbors who visited someone: /, '\n')
              .replace(/\.$/, '')
          : given;
      send(text, minimal);
      summary = text;
      break;
    }
    case 'diviner': {
      const q = choice?.text || clean(c.question, 500) || 'your question';
      s.questions[p.id] = q;
      const answer = clean(c.target);
      requireThat(
        g.players.some((x) => x.id === answer),
        'Choose the player to suggest.',
      );
      send(
        `You asked: “${q}”. The Storyteller suggests you speak to ${nameOf(g, answer)}.`,
        nameOf(g, answer),
      );
      summary = info;
      break;
    }
    case 'medium': {
      const target = H[0];
      enforce(
        s.nightStartDead.includes(target.id),
        'The Medium must choose a player who was dead at the start of the night.',
        c,
      );
      if (fine) {
        s.medium = { medium: p.id, target: target.id, night: g.night };
        if (!isST)
          s.channel = { id: uuid(), a: p.id, b: target.id, night: g.night };
        const can =
          GRANTABLE.includes(actsAs(target)) &&
          !(ONCE.includes(actsAs(target)) && target.used);
        message(
          g,
          target.id,
          `The Medium has reached you. ${can ? 'You may use your night ability tonight.' : 'Your ability cannot be used again.'} You can talk privately with them until dawn.`,
          now,
        );
        send(
          `You have reached ${target.name}. You can talk privately until dawn.`,
          target.name,
        );
      } else send(`You reach out to ${target.name}…`, target.name);
      summary = `Medium chose ${target.name}.${fine ? '' : ' Impaired: no channel or ability.'}`;
      break;
    }
    case 'gravedigger':
    case 'priest':
    case 'necromancer': {
      if (pass) {
        send('You did not use your ability tonight.', 'Passed');
        summary = `${role(r)?.name} passed.`;
        break;
      }
      const target = H[0];
      enforce(
        s.nightStartDead.includes(target.id),
        'Choose a player who was dead at the start of the night.',
        c,
      );
      requireThat(
        r === 'gravedigger' || team(target.role) !== 'demon',
        'The Horror cannot be revived.',
      );
      let newRole = target.role;
      if (r === 'priest' && team(target.role) === 'minion')
        newRole = clean(c.newRole);
      if (r === 'necromancer' && team(target.role) !== 'minion')
        newRole = clean(c.newRole);
      if (newRole !== target.role) {
        const want = r === 'priest' ? 'townsfolk' : 'minion';
        requireThat(
          team(newRole) === want && HMS_ROLES.some((x) => x.id === newRole),
          `Choose an out-of-play ${want === 'townsfolk' ? 'Villager' : 'Haunt'} for the revived player.`,
        );
        enforce(
          !g.players.some((q) => q.role === newRole),
          'That character is already in play.',
          c,
        );
      }
      once();
      const allowed = r !== 'gravedigger' || c.refuse !== true;
      if (fine && allowed) {
        s.dawnChanges.push({
          id: uuid(),
          kind: r === 'gravedigger' ? 'become' : 'revive',
          player: r === 'gravedigger' ? p.id : target.id,
          role: newRole,
          by: p.id,
        });
        summary =
          r === 'gravedigger'
            ? `At dawn ${p.name} becomes the ${roleName(newRole)}.`
            : `At dawn ${target.name} returns as the ${roleName(newRole)}.`;
      } else
        summary = `${role(r)?.name} chose ${target.name}. ${fine ? 'The Storyteller refused the change.' : 'Impaired: nothing happens.'}`;
      send(`You chose ${target.name}.`, target.name);
      break;
    }
    case 'guess': {
      const con = s.constellation!;
      const pairs = con.members.map((m, i) => ({
        player: m,
        role:
          clean(c['guess' + (i + 1)]) ||
          choice?.guesses?.find((x) => x.player === m)?.role ||
          '',
      }));
      if (c.pass === true || (choice?.pass && !pairs.some((x) => x.role))) {
        send('You keep your guess for another night.', 'Passed');
        summary = 'Constellation passed.';
        break;
      }
      requireThat(
        pairs.every((x) => role(x.role)),
        'Choose a character for each member.',
      );
      const correct = pairs.every(
        (x) =>
          (person(g, x.player).shown || person(g, x.player).role) === x.role,
      );
      const outcome =
        clean(c.outcome) || (fine && correct ? 'correct' : 'wrong');
      enforce(
        outcome === (fine && correct ? 'correct' : 'wrong'),
        'This differs from the actual characters.',
        c,
      );
      const member = clean(c.rewardPlayer);
      const other = clean(c.killMember);
      if (outcome === 'correct') {
        requireThat(con.members.includes(member), 'Choose a member to reward.');
        requireThat(
          clean(c.reward) !== 'revive' || !person(g, member).alive,
          'Only a dead member can be revived.',
        );
      } else
        requireThat(
          !other || (con.members.includes(other) && other !== p.id),
          'Choose another Constellation member.',
        );
      once();
      if (outcome === 'correct') {
        const kind = clean(c.reward);
        if (kind === 'revive') {
          s.dawnChanges.push({
            id: uuid(),
            kind: 'revive',
            player: member,
            role: person(g, member).role,
            by: p.id,
          });
        } else
          person(g, member).extraLife = (person(g, member).extraLife ?? 0) + 1;
        send('Your guess was correct.', 'Resolved');
        summary = `Constellation guessed correctly: ${kind === 'revive' ? nameOf(g, member) + ' returns at dawn' : nameOf(g, member) + ' gains an extra life'}.`;
      } else {
        con.linked = false;
        if (c.killSelf === true && p.alive)
          enqueueDeath(g, p.id, 'Constellation guess');
        if (other) enqueueDeath(g, other, 'Constellation guess');
        send('Your guess was wrong. The link is broken.', 'Resolved');
        summary = `Constellation guessed wrong; link broken.${c.killSelf === true ? ' ' + p.name + ' may die.' : ''}${other ? ' ' + nameOf(g, other) + ' may die.' : ''}`;
      }
      break;
    }
    case 'miasma':
      if (fine) s.infected = { target: H[0].id, by: p.id, night: g.night };
      send(`You infect ${H[0].name}.`);
      summary = `Miasma infects ${H[0].name}.${fine ? '' : ' Impaired: no plague.'}`;
      break;
    case 'grimreaper':
      if (fine) H[0].marked = true;
      send(`You mark ${H[0].name}.`);
      summary = `Grim Reaper marks ${H[0].name}.${fine ? '' : ' Impaired: no mark.'}`;
      break;
    case 'werewolf': {
      if (!count) {
        const step = g.night % 3;
        send(`You prepare for the full moon (${step}/2).`);
        summary = `Werewolf prepares (${step}/2).`;
        break;
      }
      H.forEach((q) => enqueueDeath(g, q.id, 'Werewolf', { impaired: !fine }));
      send(`You choose ${H.map((q) => q.name).join(', ')}.`);
      summary = `Werewolf chooses ${H.map((q) => q.name).join(', ')}. Deaths resolve after the Insomniac.`;
      break;
    }
    case 'dreameater': {
      const guesses: { player: string; role: string }[] = [];
      for (let i = 1; i <= 15; i++) {
        const pl = clean(c[`g${i}player`]);
        const ro = clean(c[`g${i}role`]);
        if (pl && ro) guesses.push({ player: pl, role: ro });
      }
      requireThat(
        guesses.every(
          (x) => g.players.some((q) => q.id === x.player) && role(x.role),
        ),
        'Each guess needs a player and a character.',
      );
      if (!guesses.length) {
        send('You make no guesses tonight.');
        summary = 'Dreameater made no guesses.';
        break;
      }
      const right = guesses.filter((x) => {
        const q = person(g, x.player);
        return (q.shown || q.role) === x.role;
      });
      const wrong = guesses.length - right.length;
      if (fine) {
        const holder = isST ? null : p;
        const misses = (holder?.misses ?? 0) + wrong;
        if (holder) holder.misses = misses;
        if (misses >= 3 && holder) {
          enqueueDeath(g, holder.id, 'Dreameater’s third wrong guess');
          summary = `Dreameater reaches ${misses} wrong guesses and will die; tonight’s correct guesses do not count.`;
        } else {
          right.forEach((x) => enqueueDeath(g, x.player, 'Dreameater'));
          summary = `Dreameater: ${right.length} correct (${right.map((x) => nameOf(g, x.player)).join(', ') || 'none'}), ${wrong} wrong (${misses} total).`;
        }
      } else summary = 'Dreameater is impaired: no guesses take effect.';
      send('Your guesses are recorded.');
      break;
    }
    case 'nightmare': {
      const target = H[0];
      enforce(
        TARGETING.includes(actsAs(target)) && target.alive,
        'Choose a living player with a nighttime targeting ability.',
        c,
      );
      s.nightmare!.bound = target.id;
      openNightmareDecision(g, now);
      send(
        `You now haunt ${target.name}. Once, you may redirect their ability.`,
      );
      summary = `Nightmare haunts ${target.name}.`;
      break;
    }
    default:
      summary = clean(c.info, 2000) || 'Recorded.';
      if (clean(c.info, 2000)) send(summary);
  }
  g.done.push(t.key);
  const text =
    summary + redirectNote + (overridden(c) ? ' Storyteller override.' : '');
  log(g, t.name + ': ' + text, now);
  return info && !isST
    ? `Send privately to ${p.name}:\n${info}${redirectNote}`
    : text;
}

// ---------------------------------------------------------------- deaths

export function fateweaverFor(g: Game, victim: Player) {
  return livingNeighbors(g, victim).find(
    (q) => q.role === 'fateweaver' && !q.used && q.id !== victim.id,
  );
}
export function preventedBy(g: Game, d: DeathItem) {
  const v = person(g, d.player);
  if (d.impaired) return 'the killing ability is impaired';
  if (isHof(g)) return hofPrevented(g, d);
  if ((v.extraLife ?? 0) > 0) return 'an extra life';
  if (
    !d.night &&
    isGood(v) &&
    v.role !== 'celestial' &&
    g.players.some((q) => q.role === 'celestial' && q.alive && healthy(q))
  )
    return 'the Celestial';
  return '';
}
export function resolveDeath(g: Game, c: Command, now: number): string {
  const s = hms(g);
  const d = pendingDeath(g);
  requireThat(
    d && d.id === c.death,
    'The pending death changed. Review it again.',
  );
  const v = person(g, d.player);
  const remove = () =>
    (s.deathQueue = s.deathQueue.filter((x) => x.id !== d.id));
  if (!v.alive) {
    remove();
    return `${v.name} is already dead.`;
  }
  const reason = preventedBy(g, d);
  const outcome = clean(c.outcome) || (reason ? 'spare' : 'kill');
  enforce(
    outcome === (reason ? 'spare' : 'kill'),
    'This differs from the suggested outcome.',
    c,
  );
  if (outcome === 'spare') {
    if (reason === 'an extra life') v.extraLife = (v.extraLife ?? 1) - 1;
    remove();
    log(
      g,
      `${v.name} survives (${d.cause}; ${reason || 'Storyteller ruling'}).`,
      now,
    );
    return `${v.name} does not die.`;
  }
  // Horrors of Fearville: the Guardian dies in place of their ward.
  const guardian =
    isHof(g) && !d.redirected && c.guardian !== false
      ? guardianFor(g, v)
      : undefined;
  if (guardian) {
    remove();
    enqueueDeath(
      g,
      guardian.id,
      `${d.cause}, the Guardian took ${v.name}’s place`,
      { ready: true, night: d.night, redirected: true },
      true,
    );
    log(g, `Guardian ${guardian.name} dies in place of ${v.name}.`, now);
    return `The Guardian dies in place of ${v.name}. Resolve it next.`;
  }
  const weaver = !d.redirected ? fateweaverFor(g, v) : undefined;
  const to = weaver ? clean(c.fateweaver) : '';
  if (to) {
    const next = person(g, to);
    requireThat(
      next.alive && next.id !== v.id,
      'Choose a different living player.',
    );
  } else validateTriggers(g, v, d, c);
  if (weaver && to) {
    const next = person(g, to);
    weaver.used = true;
    remove();
    enqueueDeath(
      g,
      next.id,
      d.cause + ', redirected by the Fateweaver',
      { ready: true, night: d.night, redirected: true },
      true,
    );
    log(
      g,
      `Fateweaver ${weaver.name} redirects ${v.name}’s death to ${next.name}.`,
      now,
    );
    return `The Fateweaver redirects the death to ${next.name}. Resolve it next.`;
  }
  if (weaver) weaver.used = true;
  remove();
  kill(g, v, d, c, now);
  return `${v.name} dies (${d.cause}).${d.night ? ' Night deaths stay private until dawn.' : ''}`;
}
function validateTriggers(g: Game, v: Player, d: DeathItem, c: Command) {
  if (isHof(g)) return validateHofTriggers(g, v, d, c);
  if (v.role === 'zealot')
    requireThat(
      HMS_ROLES.some((r) => r.id === clean(c.zealotRole)),
      'Choose the ability the Zealot grants the Storyteller.',
    );
  const next = clean(c.priestRole);
  if (v.role === 'priest' && !v.revived && healthy(v) && next)
    requireThat(
      team(next) === 'townsfolk' &&
        HMS_ROLES.some((r) => r.id === next) &&
        !g.players.some((q) => q.role === next),
      'Choose an out-of-play Villager.',
    );
  const drunk = clean(c.celestialDrunk);
  if (v.role === 'celestial' && d.cause === 'execution' && drunk)
    requireThat(
      team(person(g, drunk).role) === 'townsfolk',
      'Choose a Villager to become drunk.',
    );
}
function kill(g: Game, v: Player, d: DeathItem, c: Command, now: number) {
  const s = hms(g);
  v.alive = false;
  v.marked = false;
  v.nightDeath = g.phase === 'night' ? g.night : 0;
  if (g.phase !== 'night') v.publicAlive = false;
  if (d.cause === 'execution') v.executed = true;
  log(g, `${v.name} died (${d.cause}).`, now, g.phase !== 'night');
  // Constellation link
  const con = s.constellation;
  if (con?.linked && con.members.includes(v.id))
    for (const m of con.members)
      if (m !== v.id && c['link_' + m] === true && person(g, m).alive)
        enqueueDeath(g, m, 'Constellation link', { ready: true });
  // The Zealot's death always grants the Storyteller an ability, even drunk.
  if (v.role === 'zealot') {
    const granted = clean(c.zealotRole);
    requireThat(
      HMS_ROLES.some((r) => r.id === granted),
      'Choose the ability the Zealot grants the Storyteller.',
    );
    s.stRole = granted;
    s.stUsed = false;
    s.stNight = g.night;
    log(
      g,
      `The Storyteller gains the ${roleName(granted)} ability (Zealot).`,
      now,
    );
  }
  if (v.role === 'priest' && !v.revived && healthy(v)) {
    const next = clean(c.priestRole);
    if (next) {
      requireThat(
        team(next) === 'townsfolk' &&
          HMS_ROLES.some((r) => r.id === next) &&
          !g.players.some((q) => q.role === next),
        'Choose an out-of-play Villager.',
      );
      v.revived = true;
      s.dawnChanges.push({
        id: uuid(),
        kind: 'revive',
        player: v.id,
        role: next,
        by: v.id,
      });
      log(
        g,
        `${v.name} (Priest) returns at the next dawn as the ${roleName(next)}.`,
        now,
      );
    }
  }
  if (v.role === 'celestial' && d.cause === 'execution' && healthy(v)) {
    for (const q of g.players) {
      q.poisoned = true;
      q.poisonUntil = Math.max(q.poisonUntil ?? 0, g.night + 2);
    }
    const drunk = clean(c.celestialDrunk);
    if (drunk) {
      requireThat(
        team(person(g, drunk).role) === 'townsfolk',
        'Choose a Villager to become drunk.',
      );
      person(g, drunk).drunk = true;
    }
    log(
      g,
      `Celestial executed: everyone is poisoned until the next dusk${drunk ? '; ' + nameOf(g, drunk) + ' is drunk for the rest of the game' : ''}.`,
      now,
    );
  }
  if (v.role === 'nightmare' && d.cause === 'execution')
    s.nightmare = { player: v.id, bound: '', used: false };
  if (v.role === 'moonshiner')
    log(g, 'The Moonshiner died: you may sober up the Fools at any time.', now);
  if (isHof(g)) hofAfterKill(g, v, d, c, now);
}

// ---------------------------------------------------------------- dawn & day

export function hmsDawn(g: Game, now: number) {
  const s = hms(g);
  requireThat(!s.deathQueue.length, 'Resolve every queued death before dawn.');
  for (const ch of s.dawnChanges) {
    const p = person(g, ch.player);
    const old = p.role;
    p.role = ch.role;
    p.shown = ch.role;
    delete p.acts;
    p.drunk = false;
    p.used = false;
    p.misses = 0;
    if (ch.kind === 'revive') {
      p.alive = true;
      p.ghost = true;
      p.nightDeath = 0;
      p.marked = false;
      p.executed = false;
    }
    message(
      g,
      p.id,
      `${ch.kind === 'revive' ? 'You have returned to life. ' : ''}Your character is now ${roleName(ch.role)}. Your alignment is ${alignment(p)}.\n${role(ch.role)?.description}`,
      now,
    );
    log(
      g,
      `${p.name}: ${roleName(old)} → ${roleName(ch.role)} (${ch.kind === 'revive' ? 'revived' : 'Gravedigger'}).`,
      now,
    );
  }
  s.dawnChanges = [];
  if (s.channel) {
    const id = 'channel:' + s.channel.id;
    const lines = g.messages
      .filter((m) => m.to === id)
      .map((m) => `${nameOf(g, m.from)}: ${m.text}`);
    log(
      g,
      `Medium channel (${nameOf(g, s.channel.a)} ↔ ${nameOf(g, s.channel.b)}) closed.${lines.length ? '\n' + lines.join('\n') : ' No messages.'}`,
      now,
    );
    delete s.channel;
  }
  if (isHof(g)) hofDawn(g);
}
export function hmsWinHints(g: Game) {
  const alive = g.players.filter((p) => p.alive);
  const travelers = isHof(g) ? hofWinHints(g) : [];
  if (atheistInPlay(g))
    return alive.length <= 2
      ? [
          'Two players remain with an Atheist in play: evil (the Storyteller) wins.',
        ]
      : [];
  const horror = alive.some((p) => team(p.role) === 'demon');
  const hints: string[] = [];
  if (!horror) hints.push('No living Horror: good wins.');
  if (alive.length <= 2 && horror)
    hints.push('Two or fewer living players with a living Horror: evil wins.');
  return [...hints, ...travelers];
}

// Day and anytime actions. Returns null when the action is not an HMS one.
export function hmsAction(
  g: Game,
  actor: { id: string; host: boolean },
  c: Command,
  now: number,
): string | null {
  const s = hms(g);
  if (isHof(g)) {
    const result = hofAction(g, actor, c, now);
    if (result !== null) return result;
  }
  const me = actor.host ? null : person(g, actor.id);
  const day = [
    'discovery',
    'discussion',
    'nomination',
    'defense',
    'voting',
    'dayReview',
  ].includes(g.phase);
  switch (c.action) {
    case 'resolveDeath':
      requireThat(actor.host, 'Only the Storyteller can do that.');
      return resolveDeath(g, c, now);
    case 'prophetReveal': {
      requireThat(actor.host, 'Only the Storyteller can do that.');
      requireThat(
        g.phase !== 'lobby' && g.phase !== 'ended',
        'The game is not running.',
      );
      const p = person(g, c.player);
      requireThat(
        p.role === 'prophet' && p.alive,
        'Choose the living Prophet.',
      );
      const near = clean(c.neighbor);
      requireThat(
        !near || livingNeighbors(g, p).some((q) => q.id === near),
        'Choose one of the Prophet’s living neighbors.',
      );
      const night = g.phase === 'night';
      const ready = night && g.done.includes('deaths');
      for (const id of [p.id, near].filter(Boolean))
        enqueueDeath(g, id, 'Prophet reveal', { ready, night: true });
      log(
        g,
        `Prophet reveal: ${[p.id, near]
          .filter(Boolean)
          .map((id) => nameOf(g, id))
          .join(' and ')} may die tonight.`,
        now,
      );
      return (
        'The Prophet' +
        (near ? ' and ' + nameOf(g, near) : '') +
        ' are queued to die at night.'
      );
    }
    case 'soberFools': {
      requireThat(actor.host, 'Only the Storyteller can do that.');
      const fools = g.players.filter(
        (p) =>
          team(p.role) === 'outsider' &&
          p.shown !== p.role &&
          p.role !== 'lostsoul',
      );
      const lost = g.players.filter(
        (p) => p.role === 'lostsoul' && p.shown !== 'lostsoul',
      );
      for (const p of [...fools, ...lost]) {
        p.shown = p.role;
        p.drunk = p.role === 'dazed' || p.role === 'lostsoul';
        message(
          g,
          p.id,
          `You have sobered up. Your real character is ${roleName(p.role)}.\n${role(p.role)?.description}`,
          now,
        );
      }
      log(
        g,
        `Fools sobered up: ${[...fools, ...lost].map((p) => p.name).join(', ') || 'none'}.`,
        now,
      );
      return 'The Fools learn their real characters.';
    }
    case 'astrophage': {
      const p = actor.host ? stActor(g) : me;
      requireThat(
        p &&
          (actor.host
            ? p.role === 'astrophage' && !s.stUsed
            : p.role === 'astrophage' && p.alive && !p.used),
        'You cannot end the day.',
      );
      requireThat(day, 'You can only end the day during the day.');
      requireThat(c.confirm === true, 'Confirm that you want to end the day.');
      requireThat(
        g.players.filter((q) => q.alive).length > 4,
        'Not available with 4 or fewer living players.',
      );
      requireNoPendingDeath(g);
      if (actor.host) s.stUsed = true;
      else p.used = true;
      if (!ok(p)) {
        log(g, `${p.name} tried to end the day early, but is impaired.`, now);
        return 'Nothing happens.';
      }
      g.active = null;
      g.execution = '';
      message(g, 'all', 'The day ends early.', now);
      log(g, 'The Astrophage ends the day early.', now, true);
      return 'END_DAY';
    }
    case 'reap': {
      const p = actor.host ? stActor(g) : me;
      requireThat(p && p.role === 'grimreaper' && p.alive, 'You cannot reap.');
      requireThat(
        c.confirm === true,
        'Confirm that you want to kill every marked player.',
      );
      requireThat(
        g.phase !== 'lobby' && g.phase !== 'ended',
        'The game is not running.',
      );
      const marked = g.players.filter((q) => q.marked && q.alive);
      requireThat(marked.length, 'No living player is marked.');
      for (const q of marked) {
        q.marked = false;
        enqueueDeath(g, q.id, 'Grim Reaper', { ready: true, impaired: !ok(p) });
      }
      log(g, `${p.name} reaps: ${marked.map((q) => q.name).join(', ')}.`, now);
      return actor.host
        ? `Reaping ${marked.map((q) => q.name).join(', ')}. Resolve the deaths now.`
        : 'You reap your marks.';
    }
    case 'fateweaverPref': {
      requireThat(
        me && actsAs(me) === 'fateweaver',
        'Only the Fateweaver can do that.',
      );
      const t = clean(c.target);
      requireThat(!t || g.players.some((q) => q.id === t), 'Choose a player.');
      me.pref = t;
      return t
        ? `If a neighbor dies, you ask to redirect it to ${nameOf(g, t)}.`
        : 'Preference cleared.';
    }
    case 'execute': {
      requireThat(actor.host, 'Only the Storyteller can do that.');
      requireThat(
        g.phase === 'dayReview' && !g.execution,
        'Execution is decided once, in the day review.',
      );
      requireNoPendingDeath(g);
      const target = clean(c.target);
      if (target === ST) {
        if (atheistInPlay(g)) {
          g.winner = 'Good · The Storyteller was executed';
          return 'END_GAME';
        }
        const ruling = clean(c.atheistRuling);
        requireThat(
          ['nominator', 'none'].includes(ruling),
          'No Atheist is in play: choose what happens.',
        );
        g.execution = ST;
        if (ruling === 'nominator') {
          const by = g.ballots.find((b) => b.target === ST)?.by;
          if (by) enqueueDeath(g, by, 'execution');
        }
        log(
          g,
          'The Storyteller was executed with no Atheist in play.',
          now,
          true,
        );
        return ruling === 'nominator'
          ? 'No Atheist: the nominator is executed. Resolve the death.'
          : 'No Atheist: nothing happens.';
      }
      const p = person(g, target);
      requireThat(p.alive, 'Choose a living player.');
      g.execution = p.id;
      enqueueDeath(g, p.id, 'execution');
      log(g, `${p.name} is executed.`, now, true);
      return `Execute ${p.name}. Resolve the death now.`;
    }
  }
  return null;
}
export function scriptRoleOptions(g: Game, t?: string) {
  return scriptRoles(g.script)
    .filter((r) => !t || r.team === t)
    .map((r) => ({ value: r.id, label: r.name }));
}
