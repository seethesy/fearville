import { database } from '@/db';
import {
  hash,
  json,
  errorResponse,
  checkOrigin,
  limited,
} from '@/lib/game/store';
import { challenge } from '@/lib/accounts/oidc';
import {
  accountCookie,
  cookie,
  createAccountSession,
} from '@/lib/accounts/service';
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    await limited(r, 'oauth-exchange', 20);
    const body = (await r.json()) as { code?: string; verifier?: string };
    if (
      !body.code ||
      !body.verifier ||
      body.code.length > 100 ||
      body.verifier.length > 128
    )
      throw Error('Invalid exchange.');
    const expected = await challenge(body.verifier);
    const row = await database()
      .prepare(
        'DELETE FROM native_codes WHERE hash=? AND challenge=? AND expires>? RETURNING account,provider,verified_email',
      )
      .bind(await hash(body.code), expected, Date.now())
      .first<{ account: string; provider: string; verified_email: string }>();
    if (!row)
      throw Error('This device sign-in code expired or was already used.');
    const
      accountToken = await createAccountSession(
        row.account,
        row.provider,
        row.verified_email,
      ),
   ;
    // FEAR-93: the app shells (web inside a WebView) sign in through the
    // system browser, then call this same-origin; the HttpOnly cookie signs
    // the WebView in without exposing the token to page scripts.
    return json({ accountToken }, 200, {
      'Set-Cookie': cookie(accountCookie, accountToken),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
