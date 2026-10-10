import { database } from '@/db';
import { validAvatar } from '@/lib/game/avatars';
import { validDeathEffect } from '@/lib/game/cosmetics';
import {
  defaultPreferences,
  normalizePreferences,
  type ProfileDefaults,
} from './preferences';

export async function profileDefaults(
  account: string,
  fallbackName = '',
): Promise<ProfileDefaults> {
  const row = await database()
    .prepare(
      'SELECT lobby_name AS lobbyName,avatar,death_effect AS deathEffect,settings FROM account_profiles WHERE account=?',
    )
    .bind(account)
    .first<{
      lobbyName: string;
      avatar: string;
      deathEffect: string;
      settings: string;
    }>();
  return row
    ? {
        ...row,
        deathEffect: validDeathEffect(row.deathEffect)
          ? row.deathEffect
          : 'spirit',
        lobbyName: row.lobbyName || fallbackName,
        settings: normalizePreferences(JSON.parse(row.settings)),
      }
    : {
        lobbyName: fallbackName,
        avatar: 'ghost',
        deathEffect: 'spirit',
        settings: { ...defaultPreferences },
      };
}
export async function saveProfile(
  account: string,
  value: Record<string, unknown>,
) {
  const name =
    typeof value.lobbyName === 'string' ? value.lobbyName.trim() : '';
  if (!name || name.length > 32)
    throw Error('Use a lobby name between 1 and 32 characters.');
  if (!validAvatar(value.avatar)) throw Error('Choose a valid avatar.');
  if (!validDeathEffect(value.deathEffect))
    throw Error('Choose a death animation.');
  await database()
    .prepare(
      'INSERT INTO account_profiles(account,lobby_name,avatar,death_effect) VALUES (?,?,?,?) ON CONFLICT(account) DO UPDATE SET lobby_name=excluded.lobby_name,avatar=excluded.avatar,death_effect=excluded.death_effect',
    )
    .bind(account, name, value.avatar as string, value.deathEffect as string)
    .run();
  return profileDefaults(account);
}
export async function savePreferences(account: string, value: unknown) {
  const settings = normalizePreferences(value);
  await database()
    .prepare(
      'INSERT INTO account_profiles(account,settings,online_visible) VALUES (?,?,?) ON CONFLICT(account) DO UPDATE SET settings=excluded.settings,online_visible=excluded.online_visible',
    )
    .bind(account, JSON.stringify(settings), Number(settings.showOnline))
    .run();
  return settings;
}
