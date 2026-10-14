// Holy Moon and Stars rules. Uses the shared queued night engine.
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
  uuid,
  HMS_ROLES,
  type Game,
  type Player,
  type Command,
  type NightChoice,
} from '../types.ts';
import { isHof, hofChoiceSpec } from '../hof.ts';
import { requireThat, person, nameOf } from '../engine.ts';
import {
  type Task,
  hms,
  targetCount,
  seatNeighbors,
  ST,
  TARGETING,
  isHms,
  clean,
  livingNeighbors,
} from './shared.ts';
import { hmsTasks } from './tasks.ts';
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
export const NIGHTMARE_DECISION_MS = 60_000;
export function nightChoiceDeadlineFor(g: Game, t: Pick<Task, 'key'>) {
  if (g.sandbox) return Number.MAX_SAFE_INTEGER;
  const deadline =
    g.nightChoiceDeadlines?.[t.key] ?? g.nightChoiceDeadline ?? 0;
  return g.rite?.config.enabled &&
    g.rite.status === 'open' &&
    g.phase === 'night'
    ? Math.min(deadline, g.rite.lockUntil ?? deadline)
    : deadline;
}
export function openNightmareDecision(g: Game, now: number) {
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
  if (isHof(g) && t.role === 'monster') {
    const target = person(g, choice.target);
    const near = livingNeighbors(g, target);
    const feared = clean(c.fearTarget);
    requireThat(
      !feared || near.some((p) => p.id === feared),
      'Choose one of the target’s living neighbors to fear.',
    );
    choice.fearTarget = feared;
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
