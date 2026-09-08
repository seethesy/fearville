import { database } from '@/db';
import { hash, errorResponse } from '@/lib/game/store';
import { random, challenge, type Provider } from '@/lib/accounts/oidc';
import { cookie, clientID, callbackURL } from '@/lib/accounts/service';
export async function GET(r: Request) {
  try {
    const ticket = new URL(r.url).searchParams.get('ticket') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw Error('This sign-in link is invalid.');
    const browser = random();
    const flow = await database()
      .prepare(
        'UPDATE oauth_flows SET launched=1,browser=? WHERE hash=? AND launched=0 AND expires>? RETURNING provider,verifier,nonce',
      )
      .bind(await hash(browser), await hash(ticket), Date.now())
      .first<{ provider: Provider; verifier: string; nonce: string }>();
    if (!flow)
      throw Error(
        'This sign-in link expired or was already used. Start again.',
      );
    const url = new URL(
      flow.provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://appleid.apple.com/auth/authorize',
    );
    url.search = new URLSearchParams({
      client_id: clientID(flow.provider),
      redirect_uri: callbackURL(flow.provider),
      response_type: 'code',
      scope: flow.provider === 'google' ? 'openid email profile' : 'name email',
      state: ticket,
      nonce: flow.nonce,
      ...(flow.provider === 'google'
        ? {
            code_challenge: await challenge(flow.verifier),
            code_challenge_method: 'S256',
            prompt: 'select_account',
          }
        : { response_mode: 'form_post' }),
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        'Set-Cookie': cookie('ct_oauth', browser, 600, true),
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
