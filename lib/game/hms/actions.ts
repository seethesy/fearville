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
import { role, scriptRoles, type Game, type Command } from '../types.ts';
import { isHof, hofAction } from '../hof.ts';
import { requireThat, person, nameOf, log, message } from '../engine.ts';
import {
  hms,
  clean,
  livingNeighbors,
  team,
  roleName,
  stActor,
  ok,
  actsAs,
  ST,
  atheistInPlay,
} from './shared.ts';
import { enqueueDeath, requireNoPendingDeath } from './night.ts';
import { resolveDeath } from './death.ts';
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
