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
import { uuid, type Game, type DeathItem } from '../types.ts';
import { isHof, hofBeginNight } from '../hof.ts';
import { requireThat } from '../engine.ts';
import { hms } from './shared.ts';
// ---------------------------------------------------------------- night

export function hmsBeginNight(g: Game) {
  const s = hms(g);
  s.visits = [];
  s.questions = {};
  s.prophetReveal = undefined;
  s.nightStartDead = g.players.filter((p) => !p.alive).map((p) => p.id);
  delete s.medium;
  for (const p of g.players) {
    p.poisoned = !!p.poisonUntil && p.poisonUntil > g.night;
    if (!p.poisoned) delete p.poisonUntil;
  }
  if (isHof(g)) hofBeginNight(g);
}
export function visit(
  g: Game,
  from: string,
  to: string,
  r: string,
  hidden = false,
) {
  const s = hms(g);
  const v = {
    from,
    to,
    role: r,
    night: g.night,
    ...(hidden ? { hidden } : {}),
  };
  s.visits.push(v);
  if (isHof(g)) (s.history ??= []).push(v);
}
export function enqueueDeath(
  g: Game,
  player: string,
  cause: string,
  opts: Partial<DeathItem> = {},
  front = false,
) {
  const item: DeathItem = {
    id: uuid(),
    player,
    cause,
    ready: g.phase !== 'night' || g.done.includes('deaths'),
    night: g.phase === 'night',
    ...opts,
  };
  const q = hms(g).deathQueue;
  if (front) q.unshift(item);
  else q.push(item);
  return item;
}
export const pendingDeath = (g: Game) =>
  g.hms?.deathQueue.find((d) => d.ready) ?? null;
export function requireNoPendingDeath(g: Game) {
  requireThat(!pendingDeath(g), 'Resolve the pending death first.');
}
