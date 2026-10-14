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
  HMS_ROLES,
  type Game,
  type Player,
  type NightChoice,
} from '../types.ts';
import { person, nameOf, evil } from '../engine.ts';
import {
  hms,
  team,
  type Task,
  actorOf,
  evilDistance,
  roleName,
  ST,
  livingNeighbors,
} from './shared.ts';
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
