import { database } from '@/db';
import { defaultPrivacy, type Privacy } from './privacy-options';
export { canView, type Privacy, type Visibility } from './privacy-options';
export async function privacyFor(account: string): Promise<Privacy> {
  const row = await database()
    .prepare(
      'SELECT stats_visibility AS stats,history_visibility AS history,friend_requests AS requests,game_invites AS invites FROM account_settings WHERE account=?',
    )
    .bind(account)
    .first<Privacy>();
  return row ?? { ...defaultPrivacy };
}
export async function setPrivacy(account: string, value: unknown) {
  const p = value as Privacy;
  if (
    !p ||
    !['public', 'friends', 'private'].includes(p.stats) ||
    !['public', 'friends', 'private'].includes(p.history) ||
    !['everyone', 'nobody'].includes(p.requests) ||
    !['friends', 'nobody'].includes(p.invites)
  )
    throw Error('Choose valid privacy settings.');
  const db = database();
  await db.batch([
    db
      .prepare(
        'INSERT INTO account_settings (account,stats_visibility,history_visibility,friend_requests,game_invites) VALUES (?,?,?,?,?) ON CONFLICT(account) DO UPDATE SET stats_visibility=excluded.stats_visibility,history_visibility=excluded.history_visibility,friend_requests=excluded.friend_requests,game_invites=excluded.game_invites',
      )
      .bind(account, p.stats, p.history, p.requests, p.invites),
    db
      .prepare(
        "UPDATE session_invites SET status='revoked' WHERE recipient=? AND status='pending' AND ?='nobody'",
      )
      .bind(account, p.invites),
  ]);
  return p;
}
