export type MusicContext =
  | 'hub'
  | 'lobby'
  | 'night'
  | 'day'
  | 'voting'
  | 'rite'
  | `rite.${string}`
  | 'puzzleRush'
  | 'end.good'
  | 'end.evil';
/** Only consumes already authorized public phase/result and own Rite metadata. */
export function musicContext(input: {
  path: string;
  phase?: string;
  winner?: string;
  rite?: { active: boolean; pattern?: string };
}): MusicContext {
  if (input.path === '/puzzle-rush' || input.path.startsWith('/puzzle-rush/'))
    return 'puzzleRush';
  if (input.path !== '/table' && !input.path.startsWith('/table/'))
    return 'hub';
  if (!input.phase || input.phase === 'lobby') return 'lobby';
  if (input.phase === 'ended')
    return input.winner?.toLowerCase().startsWith('evil')
      ? 'end.evil'
      : 'end.good';
  if (input.phase === 'night')
    return input.rite?.active
      ? input.rite.pattern
        ? `rite.${input.rite.pattern}`
        : 'rite'
      : 'night';
  return input.phase === 'voting' ? 'voting' : 'day';
}
export type AudioSettings = {
  music: number;
  sfx: number;
  muteInBackground: boolean;
};
export function audioVolume(
  settings: AudioSettings,
  kind: 'music' | 'sfx',
  unlocked: boolean,
  background: boolean,
) {
  if (!unlocked || (background && settings.muteInBackground)) return 0;
  const value = settings[kind];
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;
}
