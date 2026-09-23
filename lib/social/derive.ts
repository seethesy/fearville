import { role, type Game, type Team } from '../game/types.ts';

export type Alignment = 'good' | 'evil';
export const alignmentOf = (team: Team | undefined): Alignment =>
  team === 'minion' || team === 'demon' ? 'evil' : 'good';

export type GameRecord = {
  id: string;
  code: string;
  hostName: string;
  winner: Alignment;
  reason: string;
  players: number;
  days: number;
  nights: number;
  started: number;
  ended: number;
  seats: {
    player: string;
    name: string;
    role: string;
    team: Alignment;
    won: boolean;
    alive: boolean;
  }[];
};

// Deterministic record id: a reused session code never collides with an older
// game because the session's creation time is part of the key.
export const gameID = (code: string, started: number) => code + ':' + started;

// The winner label set by the engine is "Good", "Evil", or "Evil · <reason>".
export function winnerOf(label: string): Alignment | null {
  if (/^good/i.test(label)) return 'good';
  if (/^evil/i.test(label)) return 'evil';
  return null;
}

// Pure derivation of a finished game's record from engine state. Returns null
// when the game did not actually reach a result worth recording: it must be in
// the ended phase, have a winning team, and have had at least one night
// (a session ended from the lobby is an abandoned table, not a game).
// Alignment is taken from each seat's final role, so a Minion who became the
// Imp is recorded as the Imp, and a Drunk is recorded as the Drunk (good).
export function deriveResult(
  g: Game,
  started: number,
  ended: number,
): GameRecord | null {
  if (g.phase !== 'ended') return null;
  const winner = winnerOf(g.winner);
  if (!winner || g.night < 1) return null;
  const seats = g.players
    .filter((p) => p.role && role(p.role))
    .map((p) => {
      const team = alignmentOf(role(p.role)?.team);
      return {
        player: p.id,
        name: p.name,
        role: p.role,
        team,
        won: team === winner,
        alive: p.alive,
      };
    });
  if (seats.length === 0) return null;
  return {
    id: gameID(g.code, started),
    code: g.code,
    hostName: g.hostName,
    winner,
    reason: g.winner,
    players: seats.length,
    days: g.day,
    nights: g.night,
    started,
    ended,
    seats,
  };
}

// Coerces untrusted JSON input to a trimmed string; objects become ''.
export const text = (value: unknown, max = 1000) =>
  (typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : ''
  )
    .trim()
    .slice(0, max);

export const RESERVED_HANDLES = new Set([
  'host',
  'all',
  'storyteller',
  'admin',
  'fearville',
  'system',
  'nobody',
]);

// Handles are lowercase, 3–20 characters of letters, digits, and underscores.
export function normalizeHandle(value: unknown): string {
  const handle = text(value, 40).replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(handle))
    throw Error(
      'Handles are 3–20 characters: lowercase letters, numbers, and underscores.',
    );
  if (RESERVED_HANDLES.has(handle)) throw Error('That handle is reserved.');
  return handle;
}

export function validStars(value: unknown): number {
  const stars = Number(value);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    throw Error('Choose a rating from 1 to 5 stars.');
  return stars;
}
