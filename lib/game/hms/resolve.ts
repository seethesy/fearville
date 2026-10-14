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
import { type Game, type Command } from '../types.ts';
import { deliverIntroduction } from '../introductions.ts';
import { isHof, hofResolve } from '../hof.ts';
import { requireThat, person, nameOf, log, message } from '../engine.ts';
import {
  type Task,
  hms,
  livingNeighbors,
  clean,
  actorOf,
  ok,
  ST,
  targetCount,
  TARGETING,
  overridden,
} from './shared.ts';
import { requireNoPendingDeath, enqueueDeath, visit } from './night.ts';
import { resolveAbility } from './abilities.ts';
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
  summary = resolveAbility(g, t, c, now, {
    r,
    hits,
    s,
    p,
    fine,
    send,
    H,
    summary,
    get info() {
      return info;
    },
    choice,
    isST,
    pass,
    once,
    count,
  });
  g.done.push(t.key);
  const text =
    summary + redirectNote + (overridden(c) ? ' Storyteller override.' : '');
  log(g, t.name + ': ' + text, now);
  return info && !isST
    ? `Send privately to ${p.name}:\n${info}${redirectNote}`
    : text;
}
