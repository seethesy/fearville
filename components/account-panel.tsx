'use client';
import AppLink from '@/components/app-link';
import { useEffect, useState } from 'react';
import type { ProfileDefaults } from '@/lib/accounts/preferences';
export type AccountView = {
  account: {
    id: string;
    name: string;
    email: string;
    handle: string | null;
    handleChangedAt: number | null;
  } | null;
  profile?: ProfileDefaults;
  providers: { google: boolean; apple: boolean };
  connections: string[];
  seats: {
    id: string;
    code: string;
    player: string;
    host: number;
    phase: string;
    hostName: string;
  }[];
  pending: { requests: number; invites: number };
};
export function AccountPanel({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<AccountView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch('/api/accounts')
      .then(async (r) => {
        if (r.ok && live) setState((await r.json()) as AccountView);
      })
      .catch(() => {
        if (live)
          setError(
            'Account service is unavailable. Guest play is still available.',
          );
      });
    return () => {
      live = false;
    };
  }, []);
  async function signin(provider: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/accounts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, link: !!state?.account }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url)
        throw Error(data.error || 'Could not start sign-in.');
      location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }
  return (
    <div className="account-panel">
      <p className="eyebrow">
        {state?.account ? 'YOUR ACCOUNT' : 'SIGN IN OR CREATE AN ACCOUNT'}
      </p>
      {state?.account ? (
        <>
          <p>
            Signed in as <strong>{state.account.name}</strong>
            {state.account.handle && (
              <span className="muted"> · @{state.account.handle}</span>
            )}
          </p>
          <div className="social-links">
            <AppLink href="/account" className="quiet-link">
              Account & saved games →
            </AppLink>
            <AppLink href="/friends" className="quiet-link">
              Friends
              {state.pending.invites + state.pending.requests > 0 && (
                <span className="count">
                  {state.pending.invites + state.pending.requests}
                </span>
              )}{' '}
              →
            </AppLink>
            <AppLink href="/stats" className="quiet-link">
              Your record →
            </AppLink>
          </div>
          {state.pending.invites > 0 && (
            <p className="invite-callout">
              <AppLink href="/friends">
                {state.pending.invites === 1
                  ? 'A friend invited you to a table.'
                  : `${state.pending.invites} friends invited you to tables.`}{' '}
                Join →
              </AppLink>
            </p>
          )}
        </>
      ) : (
        <>
          <p className="muted">
            Create an account or sign in to recover your games across devices.
          </p>
          <div className="provider-buttons">
            {(['google', 'apple'] as const).map((provider) => (
              <button
                className="secondary"
                key={provider}
                disabled={busy || !state?.providers[provider]}
                onClick={() => void signin(provider)}
              >
                Continue with {provider === 'google' ? 'Google' : 'Apple'}
              </button>
            ))}
          </div>
          <p className="hint">
            By continuing you agree to the{' '}
            <AppLink href="/terms">terms and community rules</AppLink>. Fearville
            has no tolerance for abusive or objectionable content.
          </p>
          {state && !state.providers.google && !state.providers.apple && (
            <p className="hint">
              Account sign-in is not available yet. You can play as a guest
              below.
            </p>
          )}
        </>
      )}
      {!compact && state?.account && (
        <div className="provider-buttons">
          {(['google', 'apple'] as const).map((provider) => (
            <button
              key={provider}
              className="secondary"
              disabled={
                busy ||
                state.connections.includes(provider) ||
                !state.providers[provider]
              }
              onClick={() => void signin(provider)}
            >
              {state.connections.includes(provider)
                ? 'Connected to '
                : 'Connect '}
              {provider === 'google' ? 'Google' : 'Apple'}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
