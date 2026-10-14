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
  type DeathItem,
} from '../types.ts';
import {
  isHof,
  hofPrevented,
  guardianFor,
  bodyguardFor,
  validateHofTriggers,
  hofAfterKill,
} from '../hof.ts';
import {
  requireThat,
  person,
  nameOf,
  log,
  message,
  healthy,
} from '../engine.ts';
import {
  livingNeighbors,
  isGood,
  hms,
  clean,
  enforce,
  team,
  roleName,
} from './shared.ts';
import { pendingDeath, enqueueDeath } from './night.ts';
// ---------------------------------------------------------------- deaths

export function fateweaverFor(g: Game, victim: Player) {
  return livingNeighbors(g, victim).find(
    (q) => q.role === 'fateweaver' && !q.used && q.id !== victim.id,
  );
}
export function preventedBy(g: Game, d: DeathItem) {
  const v = person(g, d.player);
  if (d.impaired) return 'the killing ability is impaired';
  if (d.night && v.protected) return 'Storyteller protection';
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
  if (isHof(g) && d.night && !d.redirected && v.role !== 'bodyguard') {
    if (!d.bodyguard) {
      const bodyguard = bodyguardFor(g, v);
      if (bodyguard) {
        d.bodyguard = { player: bodyguard.id };
        message(
          g,
          bodyguard.id,
          `${v.name} will die tonight. You may die in their place.`,
          now,
        );
        log(
          g,
          `Bodyguard ${bodyguard.name} is offered ${v.name}’s death.`,
          now,
        );
        return `The death is confirmed. ${bodyguard.name} has been told that ${v.name} will die and may take their place.`;
      }
    } else {
      requireThat(
        d.bodyguard.decision !== undefined,
        'Wait for the Bodyguard’s decision.',
      );
      const bodyguard = person(g, d.bodyguard.player);
      if (d.bodyguard.decision && bodyguard.alive && healthy(bodyguard)) {
        remove();
        enqueueDeath(
          g,
          bodyguard.id,
          `${d.cause}, the Bodyguard took ${v.name}’s place`,
          { ready: true, night: true, redirected: true },
          true,
        );
        log(g, `Bodyguard ${bodyguard.name} dies in place of ${v.name}.`, now);
        return `The Bodyguard takes ${v.name}’s place. Resolve their death next.`;
      }
    }
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
export function validateTriggers(g: Game, v: Player, d: DeathItem, c: Command) {
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
export function kill(
  g: Game,
  v: Player,
  d: DeathItem,
  c: Command,
  now: number,
) {
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
