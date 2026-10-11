import { refreshedInfoRoles } from '../rite/engine.ts';
// Horrors of Fearville rules. Holy
// Moon and Stars and Horrors of Fearville share the queued engine in hms.ts,
// which calls in here for everything specific to this script.
//
// Key terms (see lib/game/glossary.ts):
//   Fear  — the ability malfunctions, like poison. Basilisk fear lasts that
//           night; Banshee and Monster fear is carried to a later night
//           (Player.fearNight) and applied when it begins.
//   Visit — every ability that chooses a player visits them. Visits are kept
//           for the whole game (Mortician). A Wraith may stay hidden.
//   Save  — a saved player cannot die that night, whatever kills them.
//
// Order of operations for a death (see resolveDeath in hms.ts):
//   1. Prevention: an impaired killer, the Doctor's save (night only), or a
//      condition such as the Hag's "if they are Good".
//   2. The Guardian dies in place of their ward (once per death).
//   3. Death, then triggers: Executioner, Banshee, Hag, Hunter, Monster.
import {
  role,
  standardCounts,
  TEAM_ORDER,
  TEAM_NAMES,
  HOF_FIRST,
  HOF_OTHER,
  HOF_ROLES,
  MAX_PLAYERS,
  type Game,
  type Player,
  type Command,
  type DeathItem,
  type NightChoice,
  type Team,
} from './types.ts';
import {
  requireThat,
  person,
  nameOf,
  log,
  message,
  healthy,
  alignment,
} from './engine.ts';
import {
  hms,
  seats,
  seatNeighbors,
  livingNeighbors,
  enqueueDeath,
  taskFor,
  actsAs,
  team,
  type Task,
  type ChoiceSpec,
} from './hms.ts';

export const isHof = (g: Game) => g.script === 'horrors';
const roleName = (id: string) => role(id)?.name ?? id;
const isHofRole = (id: string | undefined) =>
  !!id && HOF_ROLES.some((r) => r.id === id);
const DAY = [
  'discovery',
  'discussion',
  'nomination',
  'defense',
  'voting',
  'dayReview',
];
const isDay = (g: Game) => DAY.includes(g.phase);
const running = (g: Game) => g.phase !== 'lobby' && g.phase !== 'ended';

function clean(x: unknown, max = 500) {
  return (typeof x === 'string' || typeof x === 'number' ? String(x) : '')
    .trim()
    .slice(0, max);
}
function enforce(condition: unknown, text: string, c: Command) {
  requireThat(
    condition || !!c.override,
    text + ' Use a Storyteller override if needed.',
  );
}
// Small deterministic hash, so suggestions and scrambled glimpses stay the
// same across refreshes.
function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function pick<T>(items: T[], salt: string): T | undefined {
  return items.length ? items[hash(salt) % items.length] : undefined;
}

// ---------------------------------------------------------------- tasks

function canAct(g: Game, p: Player, r: string) {
  if (!p.alive) return false;
  if (r === 'mortician') return !p.used && hms(g).nightStartDead.length > 0;
  if (r === 'psychic') return g.players.some((q) => q.id !== p.id && q.alive);
  return true;
}
export function hofTasks(g: Game): Task[] {
  const s = hms(g);
  const order =
    g.night === 1 ? HOF_FIRST : [...refreshedInfoRoles(g), ...HOF_OTHER];
  const out: Task[] = [];
  const special = (key: string, name: string) =>
    out.push({ key, role: key, player: '', name, done: g.done.includes(key) });
  for (const r of order) {
    if (r === 'minioninfo' || r === 'demoninfo') {
      if (g.players.length >= 7)
        special(
          r,
          r === 'minioninfo' ? 'Haunt introductions' : 'Horror introductions',
        );
      continue;
    }
    // Carried fear is applied when the night begins; the Sphinx's glimpse is
    // an automatic popup. Neither needs the Storyteller.
    if (r === 'fear' || r === 'sphinx') continue;
    if (r === 'deaths') {
      if (s.deathQueue.some((d) => d.night) || g.done.includes('deaths'))
        special('deaths', 'Resolve night deaths');
      continue;
    }
    for (const p of seats(g))
      if (actsAs(p) === r && canAct(g, p, r)) out.push(taskFor(r, p, g.done));
  }
  return out;
}

export function hofChoiceSpec(
  g: Game,
  t: Task,
  me: Player,
  base: Omit<ChoiceSpec, 'label' | 'eligible'>,
): ChoiceSpec | null {
  const living = (q: Player) => q.publicAlive && !q.departed;
  const notMe = (q: Player) => q.id !== me.id;
  switch (t.role) {
    case 'basilisk':
      return {
        ...base,
        label: 'Choose a player to fear tonight.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'lostwanderer':
      return {
        ...base,
        label: 'Choose a player to visit tonight.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'doctor':
      return {
        ...base,
        label: 'Choose a player to save tonight. You cannot save yourself.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'detective':
      return {
        ...base,
        label: 'Choose two players to investigate.',
        eligible: (q) => !q.departed && notMe(q),
      };
    case 'judge':
      return {
        ...base,
        label: 'Choose two players to compare their alignments.',
        eligible: (q) => !q.departed && notMe(q),
      };
    case 'watchman':
      return {
        ...base,
        label: 'Choose a player to stay on lookout for tonight.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'mortician':
      if (!hms(g).nightStartDead.length) return null;
      return {
        ...base,
        optional: true,
        label:
          'Once per game: choose a dead player to examine, or pass to save it.',
        eligible: (q) => hms(g).nightStartDead.includes(q.id) && !q.departed,
      };
    case 'monster':
      return {
        ...base,
        label: 'Choose a player to kill tonight.',
        eligible: (q) => living(q) && notMe(q),
      };
    case 'wraith':
      return {
        ...base,
        label: 'Choose a player to kill tonight.',
        flag: 'Stay hidden: nobody detects you visiting them',
        eligible: (q) => living(q) && notMe(q),
      };
  }
  return null;
}

// ---------------------------------------------------------------- setup

// Bluffs: three distinct out-of-play good characters, or as many as remain
// at very large tables.
export function bluffIssue(g: Game, good: string[]) {
  if (g.players.length < 7) return '';
  const used = (id: string) =>
    g.players.some((p) => p.role === id || p.shown === id || p.acts === id);
  const available = good.filter((id) => !used(id)).length;
  const need = Math.min(3, available);
  const ok =
    g.bluffs.length >= need &&
    g.bluffs.length <= 3 &&
    new Set(g.bluffs).size === g.bluffs.length &&
    g.bluffs.every((id) => good.includes(id) && !used(id));
  if (ok) return '';
  return need === 3
    ? 'Choose three distinct, out-of-play good characters as Horror bluffs.'
    : `Choose ${need} distinct, out-of-play good character${need === 1 ? '' : 's'} as Horror bluffs (only ${need} remain).`;
}
const countText = (expected: Record<Team, number>) =>
  'Expected ' +
  TEAM_ORDER.map(
    (t) =>
      `${expected[t]} ${expected[t] === 1 ? TEAM_NAMES[t].replace(/s$/, '') : TEAM_NAMES[t]}`,
  )
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1') +
  '.';
export function hofSetupIssues(g: Game) {
  const issues: string[] = [];
  const expected = standardCounts('horrors', g.players.length);
  if (!expected)
    return [`Horrors of Fearville requires 5–${MAX_PLAYERS} players.`];
  const ids = g.players.map((p) => p.role);
  if (g.players.some((p) => !isHofRole(p.role)))
    issues.push('Assign a Horrors of Fearville character to every seat.');
  if (
    TEAM_ORDER.some(
      (t) => ids.filter((id) => team(id) === t).length !== expected[t],
    )
  )
    issues.push(countText(expected));
  if (new Set(ids).size !== ids.length)
    issues.push('Characters must be unique at setup.');
  for (const p of g.players) {
    if (p.role === 'drunk') {
      if (
        team(p.shown) !== 'townsfolk' ||
        !isHofRole(p.shown) ||
        ids.includes(p.shown)
      )
        issues.push(`Show ${p.name} (Drunk) an out-of-play Villager.`);
    } else if (p.shown && p.shown !== p.role)
      issues.push(`${p.name} should be shown their own character.`);
    if (p.role === 'executioner' && p.charge) {
      const target = g.players.find((q) => q.id === p.charge);
      if (!target || target.id === p.id || team(target.role) === 'demon')
        issues.push(
          `${p.name} (Executioner) needs a target who is not the Horror.`,
        );
    }
    if (p.role === 'guardian' && p.charge) {
      if (!g.players.some((q) => q.id === p.charge && q.id !== p.id))
        issues.push(`${p.name} (Guardian) needs a ward.`);
    }
  }
  if (
    g.players.some((p) => actsAs(p) === 'detective') &&
    !g.players.some(
      (p) => p.id === g.redHerring && team(p.role) === 'townsfolk',
    )
  )
    issues.push('Choose a Villager as the Detective’s false positive.');
  const issue = bluffIssue(
    g,
    HOF_ROLES.filter((r) => ['townsfolk', 'outsider'].includes(r.team)).map(
      (r) => r.id,
    ),
  );
  if (issue) issues.push(issue);
  return issues;
}
// Default Executioner target and Guardian ward. Deterministic for a deal so
// the start form and the game agree.
export function defaultCharge(g: Game, p: Player) {
  const pool = g.players.filter(
    (q) =>
      q.id !== p.id && (p.role !== 'executioner' || team(q.role) !== 'demon'),
  );
  return pick(pool, (g.assignmentSeed ?? '') + p.id)?.id ?? '';
}
export function hofStartState(g: Game, c: Command) {
  for (const p of g.players) {
    delete p.acts;
    p.drunk = false;
    p.feared = false;
    delete p.fearNight;
    if (p.role === 'executioner' || p.role === 'guardian')
      p.charge = clean(c['charge_' + p.id]) || p.charge || defaultCharge(g, p);
    else delete p.charge;
  }
  g.hms = undefined;
  const s = hms(g);
  s.history = [];
  s.saves = [];
  s.psychic = {};
  s.hag = {};
  s.research = {};
  s.executed = [];
  s.travelerWins = [];
}
export function hofAnnounceCharges(g: Game, now: number) {
  for (const p of g.players) {
    if (p.role === 'executioner' && p.charge)
      message(
        g,
        p.id,
        `Your execution target is ${nameOf(g, p.charge)}. You win if they are executed.`,
        now,
      );
    if (p.role === 'guardian' && p.charge)
      message(
        g,
        p.id,
        `Your ward is ${nameOf(g, p.charge)}. If they are meant to die, you die in their place. You win if they live to the end of the game.`,
        now,
      );
  }
}

// ---------------------------------------------------------------- night

export function hofBeginNight(g: Game) {
  const s = hms(g);
  s.history ??= [];
  s.saves = [];
  delete s.wanderer;
  for (const p of g.players) {
    p.feared = p.fearNight === g.night;
    if ((p.fearNight ?? 0) <= g.night) delete p.fearNight;
  }
}
export const savedTonight = (g: Game, id: string) =>
  !!g.hms?.saves?.includes(id);

// Night deaths that will happen unless something changes.
export function threatened(g: Game) {
  return hms(g).deathQueue.filter(
    (d) => d.night && !hofPrevented(g, d) && !d.impaired,
  );
}
// Visitors to a player tonight that a Watchman can see.
export function seenVisitors(g: Game, target: string, except = '') {
  return [
    ...new Set(
      hms(g)
        .visits.filter((v) => v.to === target && v.from !== except && !v.hidden)
        .map((v) => v.from),
    ),
  ];
}
// Everything the Mortician can learn about a dead player.
export function morticianFinds(g: Game, target: string, except = '') {
  const visits = (hms(g).history ?? []).filter(
    (v) => v.to === target && !v.hidden && v.from !== except,
  );
  const roles = [...new Set(visits.map((v) => roleName(v.role)))];
  const visitors = [...new Set(visits.map((v) => v.from))];
  return { roles, visitors };
}
const typeName = (t: string) => TEAM_NAMES[t as Team] ?? t;
export function psychicSuggestion(g: Game, p: Player) {
  const last = g.hms?.psychic?.[p.id];
  const pool = g.players.filter(
    (q) =>
      q.id !== p.id &&
      q.alive &&
      !q.departed &&
      (g.night === 1 || !last || team(q.role) !== last),
  );
  return pick(pool, `${g.code}:${g.night}:${p.id}`)?.id ?? '';
}
export function detectiveAnswer(g: Game, a: Player, b: Player) {
  return [a, b].some((q) => team(q.role) === 'demon' || q.id === g.redHerring)
    ? 'Yes'
    : 'No';
}
export const judgeAnswer = (a: Player, b: Player) =>
  alignment(a) === alignment(b) ? 'Yes' : 'No';

export type ResolveContext = {
  p: Player;
  H: Player[];
  choice?: NightChoice;
  fine: boolean;
  pass: boolean;
  send: (text: string) => void;
  once: () => void;
};
// Resolves one Horrors of Fearville night ability. Returns the Storyteller
// summary; information for the player goes through ctx.send.
export function hofResolve(
  g: Game,
  t: Task,
  c: Command,
  ctx: ResolveContext,
): string {
  const s = hms(g);
  const { p, H, fine, send } = ctx;
  const impaired = fine ? '' : ' Impaired: no effect.';
  const target = H[0];
  switch (t.role) {
    case 'basilisk':
      if (fine) {
        target.feared = true;
        target.fearNight = g.night;
      }
      send(`You fear ${target.name} tonight.`);
      return `Basilisk fears ${target.name} tonight.${impaired}`;
    case 'lostwanderer':
      if (fine) s.wanderer = { player: p.id, target: target.id };
      send(`You wander to ${target.name} tonight.`);
      return `Lost Wanderer visits ${target.name}.${fine ? ' Others who visit them may be redirected to one of their neighbors.' : impaired}`;
    case 'doctor':
      requireThat(target.id !== p.id, 'Players can never save themselves.');
      if (fine) (s.saves ??= []).push(target.id);
      send(`You visit ${target.name} to save them tonight.`);
      return `Doctor saves ${target.name} tonight.${impaired}`;
    case 'monster':
    case 'wraith':
      if (t.role === 'monster') {
        const feared = clean(c.monsterFear) || clean(ctx.choice?.fearTarget);
        requireThat(
          !feared || livingNeighbors(g, target).some((q) => q.id === feared),
          'Choose one of the target’s living neighbors to fear.',
        );
      }
      enqueueDeath(g, target.id, roleName(t.role), {
        impaired: !fine,
        by: t.role,
        ...(t.role === 'monster'
          ? {
              monsterFear:
                clean(c.monsterFear) || clean(ctx.choice?.fearTarget),
            }
          : {}),
      });
      send(`You visit ${target.name} to kill them tonight.`);
      return `${roleName(t.role)} attacks ${target.name}${c.hidden === true ? ' (hidden)' : ''}. The death resolves at the end of the night.${impaired}`;
    case 'detective':
    case 'judge': {
      const [a, b] = H;
      const actual =
        t.role === 'detective' ? detectiveAnswer(g, a, b) : judgeAnswer(a, b);
      const given = clean(c.info) || actual;
      requireThat(['Yes', 'No'].includes(given), 'Answer Yes or No.');
      enforce(
        !fine || given === actual,
        'This differs from the actual characters.',
        c,
      );
      const text =
        t.role === 'detective'
          ? `${a.name} and ${b.name}: ${given}.`
          : `${a.name} and ${b.name} are ${given === 'Yes' ? 'the same alignment' : 'different alignments'}.`;
      send(text);
      return text;
    }
    case 'watchman': {
      const actual = seenVisitors(g, target.id, p.id)
        .map((id) => nameOf(g, id))
        .join(', ');
      const given = clean(c.info, 2000) || actual;
      enforce(
        !fine || given === actual,
        'This differs from the actual visitors.',
        c,
      );
      const text = given
        ? `Visitors to ${target.name} tonight: ${given}.`
        : `Nobody visited ${target.name} tonight.`;
      send(text);
      return text;
    }
    case 'mortician': {
      if (ctx.pass) {
        send('You did not use your ability tonight.');
        return 'Mortician passed.';
      }
      enforce(
        s.nightStartDead.includes(target.id),
        'Choose a player who was dead at the start of the night.',
        c,
      );
      ctx.once();
      const found = morticianFinds(g, target.id, p.id);
      const roles = clean(c.info, 2000) || found.roles.join(', ');
      const named = clean(c.name);
      requireThat(
        !named || g.players.some((q) => q.id === named),
        'Choose a player.',
      );
      enforce(
        !fine ||
          ((!clean(c.info, 2000) || roles === found.roles.join(', ')) &&
            (!named || found.visitors.includes(named))),
        'This differs from the recorded visits.',
        c,
      );
      const name =
        named || (found.visitors.length >= 3 ? found.visitors[0] : '');
      const text = `Roles that visited ${target.name} this game: ${roles || 'none'}.${name ? ` One of their visitors was ${nameOf(g, name)}.` : ''}`;
      send(text);
      return text;
    }
    case 'psychic': {
      requireThat(target.id !== p.id, 'The Psychic visits another player.');
      const last = s.psychic?.[p.id];
      enforce(
        !fine || g.night === 1 || !last || team(target.role) !== last,
        `Choose a player whose role type is not ${typeName(last ?? '')}.`,
        c,
      );
      (s.psychic ??= {})[p.id] = team(target.role);
      send(`Tonight you visit ${target.name}.`);
      return `Psychic visits ${target.name} (${typeName(team(target.role))}).`;
    }
    case 'sheriff':
    case 'hoflibrarian': {
      const want = t.role === 'sheriff' ? 'minion' : 'townsfolk';
      const a = person(g, c.target);
      const b = person(g, c.target2);
      requireThat(a.id !== b.id, 'Choose two different players.');
      const shown = clean(c.reveal);
      requireThat(
        isHofRole(shown) && team(shown) === want,
        `Choose a ${want === 'minion' ? 'Haunt' : 'Villager'} character.`,
      );
      enforce(
        !fine || a.role === shown || b.role === shown,
        'Neither player has that character.',
        c,
      );
      const text = `One of ${a.name} and ${b.name} is the ${roleName(shown)}.`;
      send(text);
      return text;
    }
    case 'teacher': {
      const near = seatNeighbors(g, p);
      const shown = clean(c.reveal);
      requireThat(isHofRole(shown), 'Choose a character.');
      enforce(
        !fine || near.some((q) => q.role === shown),
        'Neither neighbor has that character.',
        c,
      );
      const text = `One of your neighbors (${near.map((q) => q.name).join(' and ')}) is the ${roleName(shown)}.`;
      send(text);
      return text;
    }
  }
  const info = clean(c.info, 2000);
  if (info) send(info);
  return info || 'Recorded.';
}

// ---------------------------------------------------------------- deaths

export function hofPrevented(g: Game, d: DeathItem) {
  if (d.spare) return d.spare;
  if (d.night && savedTonight(g, d.player)) return 'the Doctor’s save';
  return '';
}
export function guardianFor(g: Game, victim: Player) {
  return g.players.find(
    (q) =>
      q.role === 'guardian' &&
      q.charge === victim.id &&
      q.alive &&
      q.id !== victim.id &&
      healthy(q),
  );
}
export function bodyguardFor(g: Game, victim: Player) {
  return g.players.find(
    (q) =>
      q.role === 'bodyguard' && q.alive && !q.departed && q.id !== victim.id,
  );
}
export function validateHofTriggers(
  g: Game,
  v: Player,
  d: DeathItem,
  c: Command,
) {
  const haunt = clean(c.hunterHaunt);
  if (haunt)
    requireThat(
      g.players.some(
        (q) => q.id === haunt && q.alive && team(q.role) === 'minion',
      ),
      'Choose a living Haunt for the Hunter.',
    );
  void d;
}
// After a Horrors of Fearville death.
export function hofAfterKill(
  g: Game,
  v: Player,
  d: DeathItem,
  c: Command,
  now: number,
) {
  const s = hms(g);
  const working = healthy(v);
  if (d.cause === 'execution') {
    (s.executed ??= []).push(v.id);
    for (const q of g.players.filter(
      (q) => q.role === 'executioner' && q.charge === v.id,
    ))
      winTraveler(g, q, now, `${v.name} was executed`);
    if (v.role === 'banshee' && working) {
      const next = g.night + 1;
      for (const q of g.players.filter((q) => team(q.role) === 'townsfolk'))
        q.fearNight = next;
      log(
        g,
        `Banshee executed: every Villager is feared on Night ${next}.`,
        now,
      );
    }
  }
  if (v.role === 'hag') {
    (s.hag ??= {})[v.id] = working;
    log(
      g,
      `${v.name} (Hag) died and may declare another player to die${working ? '' : ' (impaired: it will not work)'}.`,
      now,
    );
  }
  if (v.role === 'hunter' && d.night && working) {
    const haunt = clean(c.hunterHaunt);
    if (haunt) {
      enqueueDeath(g, haunt, 'Hunter', { ready: true, night: true });
      log(g, `Hunter: ${nameOf(g, haunt)} may die too.`, now);
    }
  }
  if (d.by === 'monster' && !d.impaired) {
    const feared = d.monsterFear;
    if (feared && person(g, feared).alive) {
      person(g, feared).fearNight = g.night + 1;
      log(
        g,
        `Monster: ${nameOf(g, feared)} is feared on Night ${g.night + 1}.`,
        now,
      );
    }
  }
  for (const q of g.players.filter(
    (q) => q.role === 'guardian' && q.charge === v.id,
  ))
    log(g, `${q.name}’s ward ${v.name} died.`, now);
}
function winTraveler(g: Game, p: Player, now: number, why: string) {
  const s = hms(g);
  s.travelerWins ??= [];
  if (s.travelerWins.includes(p.id)) return;
  s.travelerWins.push(p.id);
  log(
    g,
    `${p.name} (${roleName(p.role)}) meets their win condition: ${why}.`,
    now,
  );
}

// ---------------------------------------------------------------- dawn & end

export function hofDawn(g: Game) {
  const s = hms(g);
  for (const p of g.players) p.feared = false;
  s.saves = [];
  delete s.wanderer;
}
// Traveler wins are added to the team result when the game ends.
export function hofFinish(g: Game, now: number) {
  const s = hms(g);
  if (/Travelers?:/.test(g.winner)) return;
  const travelers = g.players.filter((p) => team(p.role) === 'traveler');
  if (!travelers.length) return;
  for (const p of travelers) {
    if (p.role === 'guardian') {
      const ward = g.players.find((q) => q.id === p.charge);
      if (ward?.alive) winTraveler(g, p, now, `${ward.name} lived to the end`);
    }
    if (p.role === 'researcher') {
      const r = s.research?.[p.id];
      if (r?.correct) winTraveler(g, p, now, 'all three roles were correct');
      if (r)
        message(
          g,
          p.id,
          r.correct
            ? 'Your declaration was correct about all three players. You win.'
            : 'Your declaration was not correct about all three players.',
          now,
        );
    }
  }
  const won = travelers.filter((p) => s.travelerWins?.includes(p.id));
  g.winner += won.length
    ? ` · Travelers: ${won.map((p) => `${p.name} (${roleName(p.role)})`).join(', ')} also win`
    : ' · Travelers: none won';
}
export function hofWinHints(g: Game) {
  const s = g.hms;
  const won = (s?.travelerWins ?? []).map((id) => nameOf(g, id));
  return won.length
    ? [`Travelers who have met their win condition: ${won.join(', ')}.`]
    : [];
}

// ---------------------------------------------------------------- day

// Day declarations and Storyteller rulings. Returns null when the action is
// not a Horrors of Fearville one.
export function hofAction(
  g: Game,
  actor: { id: string; host: boolean },
  c: Command,
  now: number,
): string | null {
  const s = hms(g);
  switch (c.action) {
    case 'bodyguardAccept':
    case 'bodyguardDecline': {
      const d = s.deathQueue.find((item) => item.id === clean(c.death));
      requireThat(
        d?.bodyguard && d.bodyguard.decision === undefined,
        'This Bodyguard offer is no longer available.',
      );
      requireThat(
        actor.host || actor.id === d.bodyguard.player,
        'Only the Bodyguard can answer this offer.',
      );
      const accepted = c.action === 'bodyguardAccept';
      d.bodyguard.decision = accepted;
      log(
        g,
        `Bodyguard ${nameOf(g, d.bodyguard.player)} ${accepted ? 'offers to die' : 'declines to die'} in ${nameOf(g, d.player)}’s place.`,
        now,
      );
      return accepted
        ? 'You offered to die in their place.'
        : 'You declined the offer.';
    }
    case 'vigilanteDeclare': {
      requireThat(!actor.host, 'Use “Resolve Vigilante declaration”.');
      const me = person(g, actor.id);
      requireThat(
        actsAs(me) === 'vigilante' && me.alive && !me.used,
        'You cannot declare a kill.',
      );
      requireThat(isDay(g), 'Declarations are made during the day.');
      requireThat(!s.vigilante, 'A Vigilante declaration is already waiting.');
      const target = person(g, c.target);
      requireThat(
        target.alive && target.id !== me.id && !target.departed,
        'Choose another living player.',
      );
      requireThat(c.confirm === true, 'Confirm your declaration.');
      me.used = true;
      s.vigilante = { player: me.id, target: target.id };
      message(
        g,
        'all',
        `${me.name}: “I am the Vigilante and I declare that I want to kill ${target.name}.”`,
        now,
      );
      log(
        g,
        `${me.name} declares as the Vigilante against ${target.name}.`,
        now,
        true,
      );
      return 'Declaration made. The Storyteller decides what happens.';
    }
    case 'vigilante': {
      requireThat(actor.host, 'Only the Storyteller can do that.');
      requireThat(isDay(g), 'The Vigilante acts during the day.');
      const p = person(g, clean(c.player) || s.vigilante?.player);
      const target = person(g, clean(c.target) || s.vigilante?.target);
      requireThat(target.alive, 'Choose a living player.');
      const declared = s.vigilante?.player === p.id;
      if (!declared)
        enforce(
          actsAs(p) === 'vigilante' && p.alive && !p.used,
          'This player cannot use the Vigilante ability.',
          c,
        );
      const works = actsAs(p) === 'vigilante' && healthy(p);
      const outcome = clean(c.outcome) || (works ? 'kill' : 'spare');
      enforce(
        outcome === (works ? 'kill' : 'spare'),
        'This differs from the suggested outcome.',
        c,
      );
      p.used = true;
      delete s.vigilante;
      if (!declared)
        message(
          g,
          'all',
          `${p.name}: “I am the Vigilante and I declare that I want to kill ${target.name}.”`,
          now,
        );
      if (outcome === 'kill') {
        enqueueDeath(g, target.id, 'Vigilante', { ready: true });
        log(
          g,
          `The Vigilante’s declaration against ${target.name} succeeds.`,
          now,
          true,
        );
        return `${target.name} may die now. Resolve the death.`;
      }
      log(
        g,
        `The Vigilante’s declaration against ${target.name} has no effect.`,
        now,
        true,
      );
      message(g, 'all', `Nothing happens to ${target.name}.`, now);
      return 'No effect.';
    }
    case 'researcherDeclare': {
      const p = actor.host ? person(g, c.player) : person(g, actor.id);
      requireThat(
        p.role === 'researcher' && !p.used,
        'This player cannot make a Researcher declaration.',
      );
      requireThat(isDay(g), 'Declarations are made during the day.');
      const guesses = [1, 2, 3].map((i) => ({
        player: clean(c['player' + i]),
        role: clean(c['role' + i]),
      }));
      requireThat(
        new Set(guesses.map((x) => x.player)).size === 3 &&
          guesses.every(
            (x) =>
              isHofRole(x.role) &&
              g.players.some(
                (q) => q.id === x.player && q.alive && q.id !== p.id,
              ),
          ),
        'Name a role for three different living players.',
      );
      const correct = guesses.every((x) => person(g, x.player).role === x.role);
      p.used = true;
      (s.research ??= {})[p.id] = { guesses, correct };
      message(
        g,
        'all',
        `${p.name}: “I am the Researcher and I declare that ${guesses
          .map((x) => `${nameOf(g, x.player)} is the ${roleName(x.role)}`)
          .join(', ')
          .replace(/, ([^,]*)$/, ' and $1')}.”`,
        now,
      );
      log(
        g,
        `Researcher ${p.name}’s declaration is ${correct ? 'correct' : 'wrong'} (revealed at the end of the game).`,
        now,
      );
      return actor.host
        ? `Declaration recorded: ${correct ? 'correct' : 'wrong'}. The Researcher learns the result at the end of the game.`
        : 'Declaration made. You learn the result at the end of the game.';
    }
    case 'hagDeclare': {
      requireThat(running(g), 'The game is not running.');
      const hag = actor.host ? person(g, c.player) : person(g, actor.id);
      requireThat(
        hag.role === 'hag' && s.hag && hag.id in s.hag,
        'This player has no Hag declaration to make.',
      );
      requireThat(
        !(g.phase === 'night' && hag.nightDeath === g.night),
        'Wait until morning to make your declaration.',
      );
      const target = person(g, c.target);
      requireThat(
        target.alive && target.id !== hag.id && !target.departed,
        'Choose another living player.',
      );
      const working = s.hag[hag.id];
      delete s.hag[hag.id];
      const ready = g.phase === 'night' && g.done.includes('deaths');
      const spare = !working
        ? 'the Hag’s ability is impaired'
        : alignment(target) !== 'good'
          ? 'they are not Good'
          : '';
      enqueueDeath(g, target.id, 'Hag', {
        ready,
        night: true,
        by: 'hag',
        ...(spare ? { spare } : {}),
      });
      message(
        g,
        'all',
        `${hag.name}: “I am the Hag and I declare that ${target.name} will die.”`,
        now,
      );
      log(
        g,
        `Hag ${hag.name} declares ${target.name}. They may die tonight${spare ? ` (suggested: survives, ${spare})` : ''}.`,
        now,
      );
      return actor.host
        ? `${target.name} is queued to die tonight${spare ? `; suggested to survive because ${spare}` : ''}.`
        : 'Declaration made.';
    }
  }
  return null;
}

// ---------------------------------------------------------------- Sphinx

// The Sphinx's glimpse: every player's role, shown in a popup until the
// night-choice timer ends. A feared Sphinx sees a scrambled glimpse.
export function sphinxGlimpse(g: Game, me: Player | undefined, now: number) {
  if (!isHof(g) || g.phase !== 'night' || !me || me.departed) return null;
  if (me.role !== 'sphinx' || !me.alive) return null;
  const deadline = g.nightChoiceDeadline ?? 0;
  if (!g.sandbox && now >= deadline) return null;
  const basilisk = g.players.find(
    (q) =>
      actsAs(q) === 'basilisk' &&
      q.alive &&
      healthy(q) &&
      Object.entries(g.nightChoices ?? {}).some(
        ([key, choice]) =>
          key === 'basilisk:' + q.id && choice.target === me.id,
      ),
  );
  const ordered = seats(g);
  let roles = ordered.map((p) => p.role);
  if (!healthy(me) || basilisk) {
    const seed = `${g.code}:${g.night}:${me.id}`;
    roles = roles
      .map((r, i) => ({ r, k: hash(seed + i) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r);
  }
  return {
    id: `${g.night}:${me.id}`,
    night: g.night,
    deadline: g.sandbox ? null : deadline,
    entries: ordered.map((p, i) => ({
      seat: p.seat,
      name: p.name,
      role: roleName(roles[i]),
      alive: p.publicAlive,
    })),
  };
}
