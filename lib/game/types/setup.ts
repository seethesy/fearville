import { type Team, HMS_ROLES, HOF_ROLES } from './roles.ts';
import { type Game } from './state.ts';
// Tables seat 5–18 players in every script.
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 18;
export const COUNTS: Record<number, number[]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
  // The official sheet stops at 15 players; Fearville extends it to 18.
  16: [10, 2, 3, 1],
  17: [11, 2, 3, 1],
  18: [11, 2, 4, 1],
};
// Horrors of Fearville role breakdown, in TEAM_ORDER:
// Villagers, Fools, Travelers, Haunts, Horrors.
export const HOF_COUNTS: Record<number, number[]> = {
  5: [3, 0, 0, 1, 1],
  6: [4, 0, 0, 1, 1],
  7: [4, 1, 0, 1, 1],
  8: [5, 1, 0, 1, 1],
  9: [5, 1, 1, 1, 1],
  10: [6, 0, 1, 2, 1],
  11: [6, 1, 1, 2, 1],
  12: [6, 1, 2, 2, 1],
  13: [6, 2, 2, 2, 1],
  14: [7, 2, 2, 2, 1],
  15: [8, 1, 2, 3, 1],
  16: [8, 2, 2, 3, 1],
  17: [9, 2, 2, 3, 1],
  18: [10, 2, 2, 3, 1],
};
export const TEAM_ORDER: Team[] = [
  'townsfolk',
  'outsider',
  'traveler',
  'minion',
  'demon',
];
export const TEAM_NAMES: Record<Team, string> = {
  townsfolk: 'Villagers',
  outsider: 'Fools',
  traveler: 'Travelers',
  minion: 'Haunts',
  demon: 'Horrors',
};
// Standard team sizes for a table, keyed by team. Holy Moon and Stars has no Travelers.
export function standardCounts(
  script: string | undefined,
  players: number,
): Record<Team, number> | null {
  if (script !== 'holyMoonStars') {
    const c = HOF_COUNTS[players];
    return c
      ? {
          townsfolk: c[0],
          outsider: c[1],
          traveler: c[2],
          minion: c[3],
          demon: c[4],
        }
      : null;
  }
  const c = COUNTS[players];
  return c
    ? {
        townsfolk: c[0],
        outsider: c[1],
        traveler: 0,
        minion: c[2],
        demon: c[3],
      }
    : null;
}
export function setupCounts(g: Game): Record<Team, number> | null {
  return g.roleDistribution ?? standardCounts(g.script, g.players.length);
}
export const SCRIPTS = {
  holyMoonStars: 'Holy Moon and Stars',
  horrors: 'Horrors of Fearville',
} as const;
export type RoleScript = keyof typeof SCRIPTS;
export const scriptRoles = (script?: string) =>
  script === 'holyMoonStars' ? HMS_ROLES : HOF_ROLES;
