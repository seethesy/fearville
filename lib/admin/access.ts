import { env } from 'cloudflare:workers';
import { database } from '@/db';
import { allowlisted } from './policy';
export function adminAllowlist() {
  const value = (env as unknown as Record<string, unknown>)
    .ADMIN_EMAIL_ALLOWLIST;
  return typeof value === 'string' ? value.trim() : '';
}
export async function requirePlayerAccount(id: string) {
  const a = await database()
    .prepare('SELECT role,google_email,email,banned FROM accounts WHERE id=?')
    .bind(id)
    .first<{
      role: string;
      google_email: string | null;
      email: string;
      banned: string | null;
    }>();
  if (!a) throw Error('AUTH');
  if (a.banned !== null) throw Error('BANNED');
  if (
    a.role === 'admin' ||
    allowlisted(a.google_email || a.email, adminAllowlist())
  )
    throw Error('ADMIN_GAMEPLAY');
}
export async function requireUnmuted(id: string) {
  const a = await database()
    .prepare('SELECT muted_until FROM accounts WHERE id=?')
    .bind(id)
    .first<{ muted_until: number | null }>();
  if (a?.muted_until && a.muted_until > Date.now())
    throw Error('Communication is muted for this account.');
}
export async function checkSeatAccount(
  code: string,
  player: string,
  communication = false,
) {
  const rows = await database()
    .prepare('SELECT account FROM account_seats WHERE code=? AND player=?')
    .bind(code, player)
    .all<{ account: string }>();
  for (const row of rows.results) {
    await requirePlayerAccount(row.account);
    if (communication) await requireUnmuted(row.account);
  }
}
