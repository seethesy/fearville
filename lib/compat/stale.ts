// FEAR-121: what an open page does when the server runs newer code. Pure, so
// the decision is unit-tested; components/stale-reload.tsx acts on it.
export const BUILD_HEADER = 'X-Fearville-Build';
export const BUILD_EVENT = 'fearville:build';
export type BuildNotice = { buildId?: string; apiVersion?: number };
export type ReloadDecision = 'none' | 'now' | 'safe' | 'immediate';

const unversioned = (id?: string) =>
  !id || id === 'development' || id === 'local';

/** True when the server reports a different real build than this page's. */
export function isNewerBuild(server?: string, client?: string) {
  return !unversioned(server) && !unversioned(client) && server !== client;
}

/**
 * - Protocol bump (apiVersion differs): reload immediately, after saving input.
 * - Newer build outside a game (no table, lobby, finished game): reload now.
 * - Newer build mid-game: wait for a safe moment (see safeToReload).
 */
export function reloadDecision(
  notice: BuildNotice,
  client: { buildId: string; apiVersion: number },
  inGame: boolean,
): ReloadDecision {
  if (
    notice.apiVersion !== undefined &&
    notice.apiVersion !== client.apiVersion
  )
    return 'immediate';
  if (!isNewerBuild(notice.buildId, client.buildId)) return 'none';
  return inGame ? 'safe' : 'now';
}

/** A phase change is a safe moment unless the player is mid-action. */
export function safeToReload(state: {
  phaseKey: string;
  pendingSince: string;
  busy: boolean;
  editing: boolean;
}) {
  return state.phaseKey !== state.pendingSince && !state.busy && !state.editing;
}

/** Lobby and finished games count as "outside a game". */
export function inGame(phase?: string) {
  return !!phase && phase !== 'lobby' && phase !== 'ended';
}
