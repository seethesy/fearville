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
import { setupCounts, HMS_ROLES, type Game, type Command } from '../types.ts';
import { isHof, hofSetupIssues, hofStartState, bluffIssue } from '../hof.ts';
import { team, roleName, hms } from './shared.ts';
// ---------------------------------------------------------------- setup

export function hmsSetupIssues(g: Game) {
  if (isHof(g)) return hofSetupIssues(g);
  const issues: string[] = [];
  const configured = setupCounts(g);
  const counts = configured && [
    configured.townsfolk,
    configured.outsider,
    configured.minion,
    configured.demon,
  ];
  if (!counts) return ['Holy Moon and Stars requires 5–18 players.'];
  const ids = g.players.map((p) => p.role);
  if (g.players.some((p) => !HMS_ROLES.some((r) => r.id === p.role)))
    issues.push('Assign a Holy Moon and Stars character to every seat.');
  const atheist = ids.includes('atheist');
  const expected = g.roleDistribution
    ? counts.slice()
    : atheist
      ? [g.players.length - counts[1], counts[1], 0, 0]
      : counts;
  if (!g.roleDistribution && !atheist && ids.includes('moonshiner')) {
    expected[0] -= 1;
    expected[1] += 1;
  }
  const actual = ['townsfolk', 'outsider', 'minion', 'demon'].map(
    (t) => g.players.filter((p) => team(p.role) === t).length,
  );
  if (actual.some((v, i) => v !== expected[i]))
    issues.push(
      atheist && !g.roleDistribution
        ? `With an Atheist every player is good: expected ${expected[0]} Villagers and ${expected[1]} Fools.`
        : `Expected ${expected[0]} Villagers, ${expected[1]} Fools, ${expected[2]} Haunts and ${expected[3]} Horrors.`,
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
