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
  role,
  HOF_ROLES,
  type Game,
  type Player,
  type Command,
} from '../types.ts';
import { requireThat } from '../engine.ts';
import { hms } from '../hms.ts';
export const isHof = (g: Game) => g.script === 'horrors';
export const roleName = (id: string) => role(id)?.name ?? id;
export const isHofRole = (id: string | undefined) =>
  !!id && HOF_ROLES.some((r) => r.id === id);
export const DAY = [
  'discovery',
  'discussion',
  'nomination',
  'defense',
  'voting',
  'dayReview',
];
export const isDay = (g: Game) => DAY.includes(g.phase);
export const running = (g: Game) => g.phase !== 'lobby' && g.phase !== 'ended';
export function clean(x: unknown, max = 500) {
  return (typeof x === 'string' || typeof x === 'number' ? String(x) : '')
    .trim()
    .slice(0, max);
}
export function enforce(condition: unknown, text: string, c: Command) {
  requireThat(
    condition || !!c.override,
    text + ' Use a Storyteller override if needed.',
  );
}
// Small deterministic hash, so suggestions and scrambled glimpses stay the
// same across refreshes.
export function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
export function pick<T>(items: T[], salt: string): T | undefined {
  return items.length ? items[hash(salt) % items.length] : undefined;
}
// ---------------------------------------------------------------- tasks

export function canAct(g: Game, p: Player, r: string) {
  if (!p.alive) return false;
  if (r === 'mortician') return !p.used && hms(g).nightStartDead.length > 0;
  if (r === 'psychic') return g.players.some((q) => q.id !== p.id && q.alive);
  return true;
}
