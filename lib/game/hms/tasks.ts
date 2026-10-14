import { refreshedInfoRoles } from '../../rite/engine.ts';
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
  role,
  HMS_FIRST,
  HMS_OTHER,
  type Game,
  type Player,
} from '../types.ts';
import { isHof, hofTasks } from '../hof.ts';
import { nameOf } from '../engine.ts';
import {
  type Task,
  ST,
  hms,
  ONCE,
  GRANTABLE,
  stActor,
  atheistInPlay,
  actsAs,
  seats,
} from './shared.ts';
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
export function canAct(g: Game, p: Player, r: string) {
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
  const order =
    g.night === 1 ? HMS_FIRST : [...refreshedInfoRoles(g), ...HMS_OTHER];
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
