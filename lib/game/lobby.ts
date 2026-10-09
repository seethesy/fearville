import { newGame, role, type Game, type SessionRecap } from './types.ts';
import { assignAvatars } from './avatars.ts';

export function recapOf(g: Game, ended: number): SessionRecap {
  const endedAt =
    g.gameEndedAt ??
    g.log.findLast((l) => l.text.startsWith('Game ended'))?.at ??
    ended;
  return {
    progression: g.progression,
    ranked: !!g.ranked,
    id: `${g.code}:${g.gameStartedAt ?? endedAt}`,
    ended: endedAt,
    started: g.gameStartedAt,
    number: g.sessionNumber ?? (g.recaps?.length ?? 0) + 1,
    winner: g.winner,
    script: g.script ?? ('horrors' as const),
    players: g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: role(p.role)?.name ?? p.role,
        shown: role(p.shown)?.name ?? p.shown,
        roleId: p.role,
        team: role(p.role)?.team,
        seat: p.seat,
        avatar: p.avatar,
        alive: p.alive,
        notebook: g.notebooks?.[p.id],
      })),
    decisions: g.decisions ?? [],
    messages: g.messages,
    votes: g.mvpVotes ?? {},
  };
}

export function returnToLobby(g: Game, now: number) {
  const recap = recapOf(g, now);
  const fresh = newGame(g.code, g.hostName);
  fresh.sandbox = g.sandbox;
  fresh.script = g.script;
  fresh.ranked = g.ranked;
  fresh.timers = { ...g.timers };
  fresh.recaps = [...(g.recaps ?? []), structuredClone(recap)];
  fresh.sessionNumber = (recap.number ?? fresh.recaps.length) + 1;
  fresh.players = g.players
    .filter((p) => !p.departed)
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      ...p,
      seat: p.seat,
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
  assignAvatars(fresh.players);
  for (const key of Object.keys(g))
    delete (g as unknown as Record<string, unknown>)[key];
  Object.assign(g, fresh);
  return 'Return everyone to the lobby. Seats and access are preserved for the next game.';
}
