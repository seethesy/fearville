import { env } from 'cloudflare:workers';
export function database() {
  if (!env.DB) throw Error('Database is not configured.');
  return env.DB as D1Database;
}
