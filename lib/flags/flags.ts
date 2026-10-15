// FEAR-122 remote switches: D1 storage with a short per-isolate cache.
// Each environment's switches live in its own database. The production
// Worker also binds the staging database (STAGING_DB, switches only) so the
// production admin console can edit staging switches.
import { env } from 'cloudflare:workers';
import { database } from '@/db';
import { currentEnvironment } from '../runtime/environment';
import type { RuntimeEnvironment } from '../runtime/config';
import { DEFAULT_FLAGS, fromRows, type Flags } from './catalog.ts';

export const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; flags: Flags }>();

/** Environments this Worker's admin console can edit, current first. */
export function editableEnvironments(): RuntimeEnvironment[] {
  const current = currentEnvironment();
  return current === 'production' && stagingDatabase()
    ? ['production', 'staging']
    : [current];
}
function stagingDatabase() {
  return (env as unknown as { STAGING_DB?: D1Database }).STAGING_DB;
}
export function flagsDatabase(environment: RuntimeEnvironment) {
  if (environment === currentEnvironment()) return database();
  const staging = stagingDatabase();
  if (
    environment === 'staging' &&
    currentEnvironment() === 'production' &&
    staging
  )
    return staging;
  throw Error('This console cannot edit that environment.');
}

export async function readFlags(
  environment: RuntimeEnvironment = currentEnvironment(),
  fresh = false,
): Promise<Flags> {
  const hit = cache.get(environment);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.flags;
  try {
    const rows = await flagsDatabase(environment)
      .prepare('SELECT key,value FROM feature_flags WHERE environment=?')
      .bind(environment)
      .all<{ key: string; value: string }>();
    const flags = fromRows(rows.results);
    cache.set(environment, { at: Date.now(), flags });
    return flags;
  } catch {
    // Missing table (before migration) or a D1 blip: keep the last known
    // switches, else defaults, so a read failure never takes features down.
    return hit?.flags ?? DEFAULT_FLAGS;
  }
}
export function forgetFlags(environment?: RuntimeEnvironment) {
  if (environment) cache.delete(environment);
  else cache.clear();
}

export async function flagRows(environment: RuntimeEnvironment) {
  return (
    await flagsDatabase(environment)
      .prepare(
        'SELECT key,value,updated_by,updated_at FROM feature_flags WHERE environment=? ORDER BY key',
      )
      .bind(environment)
      .all<{
        key: string;
        value: string;
        updated_by: string;
        updated_at: number;
      }>()
  ).results;
}

export function upsertFlag(
  environment: RuntimeEnvironment,
  key: string,
  value: unknown,
  admin: string,
) {
  return flagsDatabase(environment)
    .prepare(
      'INSERT INTO feature_flags(key,environment,value,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(key,environment) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at',
    )
    .bind(key, environment, JSON.stringify(value), admin, Date.now());
}
