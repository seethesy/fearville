import { removalPlan } from '@/lib/admin/lobbies';
import { allowlisted } from '@/lib/admin/policy';
import { adminAllowlist } from '@/lib/admin/access';
import { database } from '@/db';
import { hash } from '@/lib/game/store';
import { random, validateIdentity, encryptToken, type Provider } from './oidc';
import {
  accountCookie,
  cookie,
  readCookie,
  clientID,
  clientSecret,
  callbackURL,
  siteOrigin,
  config,
  createAccountSession,
  attachMember,
} from './service';
type Flow = {
  provider: Provider;
  verifier: string;
  nonce: string;
  browser: string;
  account: string | null;
  member: string | null;
  native_challenge: string | null;
};
export async function callback(r: Request, provider: Provider) {
  let native = false;
  try {
    const params =
      r.method === 'POST'
        ? new URLSearchParams(await r.text())
        : new URL(r.url).searchParams;
    const state = params.get('state') || '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(state))
      throw Error('Invalid sign-in response.');
    const browser = readCookie(r, 'ct_oauth');
    if (!browser)
      throw Error('Sign-in cookie missing. Start again in the same browser.');
    const flow = await database()
      .prepare(
        'DELETE FROM oauth_flows WHERE hash=? AND provider=? AND browser=? AND launched=1 AND expires>? RETURNING provider,verifier,nonce,browser,account,member,native_challenge',
      )
      .bind(await hash(state), provider, await hash(browser), Date.now())
      .first<Flow>();
    if (!flow) throw Error('This sign-in request expired or was already used.');
    native = !!flow.native_challenge;
    if (params.get('error')) throw Error('Sign-in was canceled or declined.');
    const code = params.get('code');
    if (!code) throw Error('No authorization code was returned.');
    const response = await fetch(
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://appleid.apple.com/auth/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientID(provider),
          client_secret: await clientSecret(provider),
          redirect_uri: callbackURL(provider, r),
          ...(provider === 'google' ? { code_verifier: flow.verifier } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const tokens = (await response.json()) as {
      id_token?: string;
      refresh_token?: string;
    };
    if (!response.ok || !tokens.id_token)
      throw Error(
        'Your provider could not complete sign-in. Please start again.',
      );
    const identity = await validateIdentity(
      tokens.id_token,
      provider,
      clientID(provider),
      flow.nonce,
    );
    const elevated =
      provider === 'google' &&
      identity.verified &&
      allowlisted(identity.email, adminAllowlist());
    if (elevated && flow.account)
      throw Error('Sign out before signing in to the dedicated admin account.');
    const identityKey = provider + ':' + identity.subject;
    const db = database();
    let existing = await db
      .prepare('SELECT account FROM identities WHERE id=?')
      .bind(identityKey)
      .first<{ account: string }>();
    if (flow.account && existing && existing.account !== flow.account)
      throw Error(
        'That provider is already connected to another Fearville account. Accounts are not merged automatically.',
      );
    if (
      flow.account &&
      !(await db
        .prepare('SELECT id FROM accounts WHERE id=?')
        .bind(flow.account)
        .first())
    )
      throw Error('Your account no longer exists.');
    if (flow.account) {
      const linked = await db
        .prepare('SELECT role FROM accounts WHERE id=?')
        .bind(flow.account)
        .first<{ role: string }>();
      if (linked?.role === 'admin')
        throw Error('Admin accounts cannot link another provider.');
    }
    let displayName = identity.name;
    if (provider === 'apple' && params.get('user')) {
      try {
        const user = JSON.parse(params.get('user')!) as {
          name?: { firstName?: string; lastName?: string };
        };
        displayName = [user.name?.firstName, user.name?.lastName]
          .filter((x) => typeof x === 'string')
          .join(' ');
      } catch {
        /* The name is optional display data, never identity. */
      }
    }
    const accountID = flow.account || existing?.account || random();
    const refresh =
      provider === 'apple' && tokens.refresh_token
        ? await encryptToken(
            tokens.refresh_token,
            config('AUTH_ENCRYPTION_KEY'),
          )
        : null;
    if (!existing) {
      await db.batch([
        db
          .prepare(
            'INSERT INTO accounts (id,name,email,created) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM identities WHERE id=?) ON CONFLICT(id) DO NOTHING',
          )
          .bind(
            accountID,
            (displayName || 'Player').slice(0, 64),
            identity.email.slice(0, 254),
            Date.now(),
            identityKey,
          ),
        db
          .prepare(
            'INSERT INTO identities (id,account,provider,refresh_token) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM accounts WHERE id=?) ON CONFLICT(id) DO NOTHING',
          )
          .bind(identityKey, accountID, provider, refresh, accountID),
      ]);
      existing = await db
        .prepare('SELECT account FROM identities WHERE id=?')
        .bind(identityKey)
        .first<{ account: string }>();
    }
    if (!existing) throw Error('Could not create your account. Try again.');
    if (flow.account && existing.account !== flow.account)
      throw Error('That provider belongs to another account.');
    if (refresh)
      await db
        .prepare('UPDATE identities SET refresh_token=? WHERE id=?')
        .bind(refresh, identityKey)
        .run();
    const account = await db
      .prepare('SELECT role,banned FROM accounts WHERE id=?')
      .bind(existing.account)
      .first<{ role: string; banned: string | null }>();
    if (account?.banned !== null) throw Error('This account is banned.');
    if (account?.role === 'admin' && !elevated)
      throw Error('Admin access requires allowlisted Google sign-in.');
    if (elevated) {
      // First promotion invalidates old player/provider sessions and saved credentials.
      const removal = await removalPlan(existing.account);
      await db.batch([
        ...removal.statements,
        db.prepare('DELETE FROM admin_assertions'),
        db
          .prepare(
            "UPDATE accounts SET role='admin',google_email=?,admin_revision=admin_revision+1 WHERE id=?",
          )
          .bind(identity.email.toLowerCase(), existing.account),
        db
          .prepare('DELETE FROM account_sessions WHERE account=?')
          .bind(existing.account),
        db
          .prepare('DELETE FROM native_codes WHERE account=?')
          .bind(existing.account),
        db
          .prepare(
            'DELETE FROM members WHERE EXISTS (SELECT 1 FROM account_seats a WHERE a.account=? AND a.code=members.code AND a.player=members.player)',
          )
          .bind(existing.account),
        db
          .prepare('DELETE FROM friendships WHERE requester=? OR addressee=?')
          .bind(existing.account, existing.account),
        db
          .prepare('DELETE FROM session_invites WHERE sender=? OR recipient=?')
          .bind(existing.account, existing.account),
        db
          .prepare('DELETE FROM admin_progression WHERE account=?')
          .bind(existing.account),
        db
          .prepare('DELETE FROM account_items WHERE account=?')
          .bind(existing.account),
        db
          .prepare('UPDATE game_players SET account=NULL WHERE account=?')
          .bind(existing.account),
        db
          .prepare('UPDATE games SET host_account=NULL WHERE host_account=?')
          .bind(existing.account),
      ]);
    } else if (flow.member) await attachMember(flow.member, existing.account);
    if (flow.native_challenge) {
      const code = random();
      await db
        .prepare(
          'INSERT INTO native_codes (hash,account,challenge,expires,provider,verified_email) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          await hash(code),
          existing.account,
          flow.native_challenge,
          Date.now() + 60000,
          provider,
          identity.verified ? identity.email.toLowerCase() : '',
        )
        .run();
      return new Response(null, {
        status: 302,
        headers: {
          Location: 'fearville://signin?code=' + code,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'Set-Cookie': cookie('ct_oauth', '', 0, true),
        },
      });
    }
    const accountToken = await createAccountSession(
      existing.account,
      provider,
      identity.verified ? identity.email.toLowerCase() : '',
    );
    const headers = new Headers({
      Location: siteOrigin(r) + '/',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    });
    headers.append('Set-Cookie', cookie(accountCookie, accountToken));
    headers.append('Set-Cookie', cookie('ct_oauth', '', 0, true));
    return new Response(null, { status: 303, headers });
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Sign-in failed.';
    const safe =
      reason.includes('JWT') ||
      reason.includes('claim') ||
      reason.includes('signature')
        ? 'Your provider identity could not be verified. Please start again.'
        : reason;
    return new Response(null, {
      status: 303,
      headers: {
        Location:
          (native
            ? 'fearville://signin?error='
            : siteOrigin(r) + '/account?error=') + encodeURIComponent(safe),
        'Cache-Control': 'no-store',
        'Set-Cookie': cookie('ct_oauth', '', 0, true),
      },
    });
  }
}
