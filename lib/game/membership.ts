import type { Actor, Game } from './types.ts';
import { requireThat, log, finishVotingIfReady } from './engine.ts';

export function renameMember(
  g: Game,
  actor: Actor,
  value: unknown,
  now: number,
) {
  requireThat(typeof value === 'string', 'Enter a name.');
  const name = value.trim();
  requireThat(
    name.length > 0 && name.length <= 32,
    'Use a name of 1–32 characters.',
  );
  if (actor.host) g.hostName = name;
  else {
    const p = g.players.find((p) => p.id === actor.id && !p.departed);
    requireThat(p, 'This seat is no longer available.');
    const old = p.name;
    p.name = name;
    log(g, `${old} is now known as ${name}.`, now, true);
  }
  // Keep a name change when rewinding game decisions.
  for (const entry of g.history) {
    if (!entry.before) continue;
    const state = JSON.parse(entry.before) as Game;
    if (actor.host) state.hostName = name;
    else {
      const p = state.players.find((p) => p.id === actor.id);
      if (p) p.name = name;
    }
    entry.before = JSON.stringify(state);
  }
}

export function removeMember(
  g: Game,
  actor: Actor,
  target: unknown,
  now: number,
) {
  requireThat(
    actor.host || target === actor.id,
    'You may only leave your own seat.',
  );
  const p = g.players.find((p) => p.id === target && !p.departed);
  requireThat(p, 'This seat is no longer available.');
  if (g.phase === 'lobby') {
    g.players = g.players
      .filter((q) => q.id !== p.id)
      .sort((a, b) => a.seat - b.seat);
    if (g.redHerring === p.id) g.redHerring = '';
  } else p.departed = true;
  finishVotingIfReady(g, now);
  g.history = [];
  log(
    g,
    `${p.name} ${actor.host ? 'was removed from' : 'left'} the table.`,
    now,
    true,
  );
  return p.id;
}
