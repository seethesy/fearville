import type { Actor, Game } from './types.ts';

/**
 * Who a credential sees the table as. A Sandbox host may look through any
 * dummy seat. An admin observer (FEAR-158) sees the Storyteller view or any
 * seat's view, and keeps the observer flag so it can never act.
 */
export function povViewer(g: Game, actor: Actor, pov: unknown): Actor {
  if (actor.observer) {
    const seat = g.players.find((p) => p.id === pov && !p.departed);
    return seat
      ? { id: seat.id, host: false, observer: true }
      : { id: 'host', host: true, observer: true };
  }
  const player =
    actor.host && g.sandbox
      ? g.players.find((p) => p.id === pov && p.dummy && !p.departed)
      : null;
  return player ? { id: player.id, host: false } : actor;
}

export const OBSERVER_READ_ONLY =
  'Admin observers can watch this table but cannot act.';
