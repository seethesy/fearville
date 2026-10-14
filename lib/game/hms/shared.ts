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
  type Game,
  type Player,
  type Command,
  type HmsState,
} from '../types.ts';
import { requireThat, person, healthy, evil } from '../engine.ts';
// The queued engine: Holy Moon and Stars and Horrors of Fearville share
// night tasks with player choices, visits, the death queue and dawn changes.
// isMoon is Holy Moon and Stars only.
export const isHms = (g: Game) =>
  g.script === 'holyMoonStars' || g.script === 'horrors';
export const isMoon = (g: Game) => g.script === 'holyMoonStars';
export const ST = 'storyteller';
export function hms(g: Game): HmsState {
  g.hms ??= {
    visits: [],
    nightStartDead: [],
    deathQueue: [],
    dawnChanges: [],
    stargazer: {},
    astrologist: {},
    questions: {},
  };
  return g.hms;
}
export type Task = {
  key: string;
  role: string;
  player: string;
  name: string;
  done: boolean;
};
// The character whose night slot a player takes. A Lost Soul acts as a
// hidden Villager; the Drunk, Dazed and Moonshiner Fools act as their shown
// Villager.
export const actsAs = (p: Player) => p.acts || p.shown || p.role;
export const team = (id: string) => role(id)?.team ?? '';
export const isGood = (p: Player) => !evil(p);
export const atheistInPlay = (g: Game) =>
  g.players.some((p) => p.role === 'atheist');
export const roleName = (id: string) => role(id)?.name ?? id;
// Abilities that choose players. These are "visits" and can be redirected by
// the Dazed or the Nightmare.
export const TARGETING = [
  'constellation',
  'stargazer',
  'astrologist',
  'mystic',
  'medium',
  'gravedigger',
  'priest',
  'necromancer',
  'spirit',
  'miasma',
  'grimreaper',
  'werewolf',
  'nightmare',
  // Horrors of Fearville
  'basilisk',
  'lostwanderer',
  'doctor',
  'monster',
  'wraith',
  'detective',
  'judge',
  'watchman',
  'mortician',
  'psychic',
];
// Abilities the Medium can grant to a dead player. Start-of-game abilities
// count as already used, so those players only receive the channel.
export const GRANTABLE = [
  'insomniac',
  'diviner',
  'spirit',
  'gravedigger',
  'priest',
  'necromancer',
  'medium',
  'miasma',
  'grimreaper',
  'werewolf',
  'dreameater',
];
export const ONCE = ['gravedigger', 'priest', 'necromancer'];
export const targetCount = (r: string, g: Game) =>
  r === 'constellation' || r === 'astrologist'
    ? 3
    : r === 'detective' || r === 'judge'
      ? 2
      : r === 'werewolf'
        ? g.night % 3 === 0
          ? 3
          : 0
        : [
              'diviner',
              'insomniac',
              'astronaut',
              'prophet',
              'dreameater',
              'guess',
            ].includes(r)
          ? 0
          : TARGETING.includes(r) || r === 'nightmareRedirect'
            ? 1
            : 0;
// The Storyteller's own seat once a Zealot grants them an ability. It cannot
// be targeted and never appears in the player list.
export function stActor(g: Game): Player | null {
  const r = g.hms?.stRole;
  if (!r) return null;
  return {
    id: ST,
    name: 'Storyteller',
    seat: 0,
    role: r,
    shown: r,
    alive: true,
    publicAlive: true,
    ghost: true,
    poisoned: false,
    protected: false,
    master: '',
    used: !!g.hms?.stUsed,
    nightDeath: 0,
    notes: '',
  };
}
export const actorOf = (g: Game, id: string) =>
  id === ST ? stActor(g)! : person(g, id);
export const ok = (p: Player) => p.id === ST || healthy(p);
export function seats(g: Game) {
  return g.players.filter((p) => !p.departed).sort((a, b) => a.seat - b.seat);
}
// Nearest living neighbors in seat order (one each way).
export function livingNeighbors(g: Game, p: Player) {
  const s = seats(g);
  const at = s.findIndex((q) => q.id === p.id);
  if (at < 0) return [];
  const found: Player[] = [];
  for (const dir of [1, -1]) {
    for (let i = 1; i < s.length; i++) {
      const q = s[(at + dir * i + s.length * i) % s.length];
      if (q.id === p.id) break;
      if (q.alive) {
        if (!found.includes(q)) found.push(q);
        break;
      }
    }
  }
  return found;
}
export function seatNeighbors(g: Game, p: Player) {
  const s = seats(g);
  const at = s.findIndex((q) => q.id === p.id);
  if (at < 0 || s.length < 2) return [];
  return [
    ...new Set([s[(at + 1) % s.length], s[(at - 1 + s.length) % s.length]]),
  ];
}
export function evilDistance(g: Game, p: Player) {
  const s = seats(g);
  const at = s.findIndex((q) => q.id === p.id);
  let best = Infinity;
  s.forEach((q, i) => {
    if (q.id === p.id || !evil(q)) return;
    const d = Math.abs(i - at);
    best = Math.min(best, d, s.length - d);
  });
  return best;
}
export function clean(x: unknown, max = 500) {
  return (typeof x === 'string' || typeof x === 'number' ? String(x) : '')
    .trim()
    .slice(0, max);
}
export const overridden = (c: Command) => !!c.override;
export function enforce(condition: unknown, text: string, c: Command) {
  requireThat(
    condition || overridden(c),
    text + ' Use a Storyteller override if needed.',
  );
}
