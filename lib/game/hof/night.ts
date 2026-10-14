import { refreshedInfoRoles } from '../../rite/engine.ts';
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
  TEAM_NAMES,
  HOF_FIRST,
  HOF_OTHER,
  type Game,
  type Player,
  type Command,
  type NightChoice,
  type Team,
} from '../types.ts';
import { requireThat, person, nameOf, alignment } from '../engine.ts';
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
} from '../hms.ts';
import { canAct, roleName, pick, clean, enforce, isHofRole } from './shared.ts';
import { hofPrevented } from './death.ts';
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
export const typeName = (t: string) => TEAM_NAMES[t as Team] ?? t;
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
