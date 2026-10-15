import { database } from '@/db';
import { accountAuth } from '@/lib/accounts/service';
import { checkOrigin, errorResponse, json, limited } from '@/lib/game/store';
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    // The admin's own session even while it browses as another viewer (FEAR-158).
    const account = await accountAuth(r, true);
    if (!account) return json({ error: 'Sign in first.' }, 401);
    if (account.role === 'admin') return json({ ok: true });
    await limited(r, 'presence', 120);
    const body = (await r.json()) as { online?: boolean };
    await database()
      .prepare(
        'INSERT INTO account_profiles(account,last_seen) VALUES (?,?) ON CONFLICT(account) DO UPDATE SET last_seen=excluded.last_seen',
      )
      .bind(account.id, body.online === false ? 0 : Date.now())
      .run();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
