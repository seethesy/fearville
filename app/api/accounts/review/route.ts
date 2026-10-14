// App Review sign-in (staging only). Returns 404 unless the staging Worker has
// REVIEW_LOGIN_USERNAME and REVIEW_LOGIN_PASSWORD set. See docs/staging-sign-in-setup.md.
import { env } from 'cloudflare:workers';
import { database } from '@/db';
import {
  accountCookie,
  cookie,
  createAccountSession,
} from '@/lib/accounts/service';
import {
  REVIEW_ACCOUNT,
  reviewAccountStatements,
  reviewCredentialsMatch,
  reviewLoginConfig,
} from '@/lib/accounts/review-login';
import { checkOrigin, errorResponse, json, limited } from '@/lib/game/store';

export async function POST(r: Request) {
  try {
    const config = reviewLoginConfig(env as unknown as Record<string, unknown>);
    if (!config) return json({ error: 'Not found.' }, 404);
    checkOrigin(r);
    await limited(r, 'review-login', 5);
    const raw = await r.text();
    if (raw.length > 1000) throw Error('Request is too large.');
    const body = JSON.parse(raw) as { username?: unknown; password?: unknown };
    const ok =
      typeof body.username === 'string' &&
      typeof body.password === 'string' &&
      body.username.length <= 200 &&
      body.password.length <= 200 &&
      (await reviewCredentialsMatch(config, body.username, body.password));
    if (!ok) return json({ error: 'Incorrect username or password.' }, 401);
    const db = database();
    await db.batch(
      reviewAccountStatements(Date.now()).map((sql) => db.prepare(sql)),
    );
    const token = await createAccountSession(REVIEW_ACCOUNT, 'review');
    return json({ account: REVIEW_ACCOUNT }, 200, {
      'Set-Cookie': cookie(accountCookie, token),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
