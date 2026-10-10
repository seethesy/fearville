import { database } from '@/db';
import {
  json,
  errorResponse,
  checkOrigin,
  hash,
  tokenOf,
  cookieName,
} from '@/lib/game/store';
import {
  accountAuth,
  accountView,
  accountToken,
  accountCookie,
  cookie,
  attachSeat,
  revokeApple,
} from '@/lib/accounts/service';
import { random } from '@/lib/accounts/oidc';
import { savePreferences, saveProfile, saveRoleTipsPreference } from '@/lib/accounts/profile';
import { setHandle } from '@/lib/social/friends';
export async function GET(r: Request) {
  try {
    return json(await accountView(r));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const a = await accountAuth(r);
    if (!a) return json({ error: 'Sign in to access your account.' }, 401);
    const raw = await r.text();
    if (raw.length > 24000) throw Error('Request is too large.');
    const body = JSON.parse(raw) as {
      action?: string;
      seat?: string;
      confirm?: string;
      handle?: string;
      settings?: unknown;
      [key: string]: unknown;
    };
    const db = database();
    if (body.action === 'profile') {
      await saveProfile(a.id, body);
      return json(await accountView(r));
    }
    if (body.action === 'preferences') {
      await savePreferences(a.id, body.settings);
      return json(await accountView(r));
    }
    if (body.action === 'roleTips') {
      await saveRoleTipsPreference(a.id, body.enabled);
      return json(await accountView(r));
    }
    if (body.action === 'handle') {
      await setHandle(a.id, body.handle);
      return json(await accountView(r));
    }
    if (body.action === 'attach') {
      await attachSeat(r, a.id);
      return json(await accountView(r));
    }
    if (body.action === 'resume') {
      const seat = await db
        .prepare(
          'SELECT code,player,host FROM account_seats WHERE id=? AND account=?',
        )
        .bind(body.seat || '', a.id)
        .first<{ code: string; player: string; host: number }>();
      if (!seat) throw Error('That seat is not saved to your account.');
      const token = random();
      await db
        .prepare(
          'INSERT INTO members (token_hash,code,player,host,expires) VALUES (?,?,?,?,?)',
        )
        .bind(
          await hash(token),
          seat.code,
          seat.player,
          seat.host,
          Date.now() + 30 * 86400000,
        )
        .run();
      return json({ code: seat.code, token }, 200, {
        'Set-Cookie': cookie(cookieName, token),
      });
    }
    if (body.action === 'signout') {
      await db
        .prepare('UPDATE account_profiles SET last_seen=0 WHERE account=?')
        .bind(a.id)
        .run();
      await db
        .prepare('DELETE FROM account_sessions WHERE hash=?')
        .bind(await hash(accountToken(r)))
        .run();
      if (tokenOf(r))
        await db
          .prepare('DELETE FROM members WHERE token_hash=?')
          .bind(await hash(tokenOf(r)))
          .run();
    } else if (body.action === 'delete') {
      if (body.confirm !== 'DELETE')
        throw Error('Type DELETE to confirm account deletion.');
      await revokeApple(a.id);
      await db.batch([
        db
          .prepare(
            'DELETE FROM members WHERE EXISTS (SELECT 1 FROM account_seats a WHERE a.account=? AND a.code=members.code AND a.player=members.player)',
          )
          .bind(a.id),
        db
          .prepare(
            'DELETE FROM sessions WHERE code IN (SELECT code FROM account_seats WHERE account=? AND host=1)',
          )
          .bind(a.id),
        db.prepare('DELETE FROM oauth_flows WHERE account=?').bind(a.id),
        db.prepare('DELETE FROM accounts WHERE id=?').bind(a.id),
      ]);
    } else throw Error('Unknown account action.');
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    headers.append('Set-Cookie', cookie(accountCookie, '', 0));
    headers.append('Set-Cookie', cookie(cookieName, '', 0));
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (e) {
    return errorResponse(e);
  }
}
