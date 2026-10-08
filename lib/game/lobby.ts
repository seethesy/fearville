import { newGame, role, type Game } from './types.ts';

export function recapOf(g: Game, ended: number) {
  return {
    id: `${g.code}:${g.gameStartedAt ?? ended}`,
    ended,
    winner: g.winner,
    script: g.script ?? ('classic' as const),
    players: g.players
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: role(p.role)?.name ?? p.role,
        shown: role(p.shown)?.name ?? p.shown,
      })),
    decisions: g.decisions ?? [],
  };
}

export function returnToLobby(g: Game, now: number) {
  const recap = recapOf(g, now);
  const fresh = newGame(g.code, g.hostName);
  fresh.sandbox = g.sandbox;
  fresh.script = g.script;
  fresh.timers = { ...g.timers };
  fresh.recaps = [...(g.recaps ?? []), recap].slice(-10);
  fresh.players = g.players
    .filter((p) => !p.departed)
    .sort((a, b) => a.seat - b.seat)
    .map((p, index) => ({
      ...p,
      seat: index + 1,
      role: '',
      shown: '',
      alive: true,
      publicAlive: true,
      ghost: true,
      poisoned: false,
      protected: false,
      master: '',
      used: false,
      nightDeath: 0,
      notes: '',
      acts: undefined,
      drunk: undefined,
      poisonUntil: undefined,
      extraLife: undefined,
      executed: undefined,
      revived: undefined,
      misses: undefined,
      marked: undefined,
      pref: undefined,
      feared: undefined,
      fearNight: undefined,
      charge: undefined,
    }));
  Object.assign(g, fresh);
  return 'Return everyone to the lobby. Seats and access are preserved for the next game.';
}
