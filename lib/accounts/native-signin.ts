// Sign-in inside the app shells (FEAR-93 design, wired up for FEAR-196):
// Google refuses OAuth in WebViews, so the shell opens the provider in its
// system sign-in browser with a PKCE challenge. The callback returns a
// single-use code that this page exchanges same-origin, which sets the
// HttpOnly ct_account cookie in the WebView.
import { hasCapability, nativeSignin } from '../native/bridge.ts';

function base64url(bytes: Uint8Array) {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** True when this page should use the shell's sign-in sheet. */
export function canSignInNatively() {
  return hasCapability('auth');
}

/**
 * Run native sign-in. Resolves true when signed in, false when cancelled;
 * throws a user-facing error otherwise.
 */
export async function signInNatively(provider: string, link: boolean) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ),
  );
  const start = await fetch('/api/accounts/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, link, nativeChallenge: challenge }),
  });
  const data = (await start.json()) as { url?: string; error?: string };
  if (!start.ok || !data.url)
    throw Error(data.error || 'Could not start sign-in.');
  const result = await nativeSignin(data.url);
  if (result === null) throw Error('Sign-in isn’t available in this app.');
  if (result === 'cancelled') return false;
  if (result.error) throw Error(result.error);
  if (!result.code) return false;
  const exchange = await fetch('/api/accounts/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: result.code, verifier }),
  });
  if (!exchange.ok) {
    const failed = (await exchange.json().catch(() => ({}))) as {
      error?: string;
    };
    throw Error(failed.error || 'Sign-in failed.');
  }
  return true;
}
