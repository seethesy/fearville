import { database } from '@/db';
import {
  json,
  hash,
  errorResponse,
  checkOrigin,
  limited,
  tokenOf,
} from '@/lib/game/store';
import { random, providerName } from '@/lib/accounts/oidc';
import { enabled, origin, accountAuth } from '@/lib/accounts/service';
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    await limited(r, 'oauth-start', 20);
    const body = (await r.json()) as {
      provider?: unknown;
      link?: boolean;
      nativeChallenge?: string;
    };
    const provider = providerName(body.provider);
    if (!enabled(provider))
      return json(
        {
          error: `${provider === 'google' ? 'Google' : 'Apple'} sign-in is not available yet. You can continue as a guest.`,
        },
        503,
      );
    const account = body.link ? await accountAuth(r) : null;
    if (account?.role === 'admin')
      throw Error('Admin accounts cannot link another provider.');
    if (body.link && !account)
      throw Error('Sign in before connecting another provider.');
    if (
      body.nativeChallenge &&
      !/^[A-Za-z0-9_-]{43}$/.test(body.nativeChallenge)
    )
      throw Error('Invalid device challenge.');
    const ticket = random();
    await database()
      .prepare(
        'INSERT INTO oauth_flows (hash,provider,verifier,nonce,account,member,native_challenge,launched,expires) VALUES (?,?,?,?,?,?,?,0,?)',
      )
      .bind(
        await hash(ticket),
        provider,
        random(),
        random(),
        account?.id || null,
        tokenOf(r) ? await hash(tokenOf(r)) : null,
        body.nativeChallenge || null,
        Date.now() + 600000,
      )
      .run();
    return json({ url: origin + '/api/accounts/authorize?ticket=' + ticket });
  } catch (e) {
    return errorResponse(e);
  }
}
