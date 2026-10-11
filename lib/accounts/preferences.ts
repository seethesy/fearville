import type { DeathEffectId } from '@/lib/game/cosmetics';
export const HANDLE_COOLDOWN = 30 * 86400000;
export const defaultPreferences = {
  music: 0,
  sfx: 60,
  muteInBackground: true,
  reducedMotion: false,
  largerText: false,
  showOnline: true,
  showTips: true,
};
export type Preferences = typeof defaultPreferences;
export type ProfileDefaults = {
  lobbyName: string;
  avatar: string;
  deathEffect: DeathEffectId;
  settings: Preferences;
};
export function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Choose valid settings.');
  const source = value as Record<string, unknown>;
  const result = { ...defaultPreferences };
  for (const key of ['music', 'sfx'] as const) {
    if (source[key] === undefined) continue;
    if (
      typeof source[key] !== 'number' ||
      !Number.isFinite(source[key]) ||
      source[key] < 0 ||
      source[key] > 100
    )
      throw Error('Volume must be between 0 and 100.');
    result[key] = Math.round(source[key]);
  }
  for (const key of [
    'muteInBackground',
    'reducedMotion',
    'largerText',
    'showOnline',
    'showTips',
  ] as const) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean') throw Error('Choose valid settings.');
    result[key] = source[key];
  }
  return result;
}
