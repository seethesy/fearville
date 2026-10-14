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
  setupCounts,
  TEAM_ORDER,
  TEAM_NAMES,
  HOF_ROLES,
  MAX_PLAYERS,
  type Game,
  type Player,
  type Command,
  type Team,
} from '../types.ts';
import { nameOf, message } from '../engine.ts';
import { hms, actsAs, team } from '../hms.ts';
import { isHofRole, pick, clean } from './shared.ts';
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
export const countText = (expected: Record<Team, number>) =>
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
  const expected = setupCounts(g);
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
