'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountPanel, type AccountView } from '@/components/account-panel';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
export default function Account() {
  const [state, setState] = useState<AccountView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/accounts');
      if (!r.ok) throw Error('Could not load your account.');
      setState((await r.json()) as AccountView);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      const reason = new URLSearchParams(location.search).get('error');
      if (reason) {
        setError(reason);
        history.replaceState(null, '', '/account');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function performAction(operation: string, seat?: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: operation, seat, confirm }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Account update failed.');
      if (operation === 'resume') location.assign('/table');
      else if (operation === 'signout' || operation === 'delete')
        location.assign('/');
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="entry">
      <header className="brand">
        <Link className="brand-mark" href="/">
          CT
        </Link>
        <span>FEARVILLE</span>
      </header>
      <div className="account-layout">
        <section className="panel">
          <h1>Your place in the town.</h1>
          <AccountPanel />
          {state?.account && (
            <>
              <p className="muted">
                {state.account.email}
                {state.account.handle ? ' · @' + state.account.handle : ''}
              </p>
              <div className="social-links">
                <Link className="quiet-link" href="/friends">
                  Friends & invitations
                  {state.pending.invites + state.pending.requests > 0 && (
                    <span className="count">
                      {state.pending.invites + state.pending.requests}
                    </span>
                  )}{' '}
                  →
                </Link>
                <Link className="quiet-link" href="/stats">
                  Your record →
                </Link>
              </div>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void performAction('attach')}
                >
                  Save current seat to account
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void performAction('signout')}
                >
                  Sign out
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                >
                  Delete account
                </button>
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Link className="quiet-link" href="/">
            Create or join a game →
          </Link>
        </section>
        {state?.account && (
          <section className="panel">
            <p className="eyebrow">SAVED GAMES</p>
            <h2>Return to your seat.</h2>
            {state.seats.length === 0 ? (
              <p className="muted">
                Your next game will be saved here. You can also save the seat
                open on this device.
              </p>
            ) : (
              state.seats.map((s) => (
                <article key={s.id} className="saved-game">
                  <div>
                    <strong>{s.code}</strong>
                    <p>
                      {s.host ? 'Storyteller' : s.hostName + '’s game'} ·{' '}
                      {s.phase}
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void performAction('resume', s.id)}
                  >
                    Resume
                  </button>
                </article>
              ))
            )}
          </section>
        )}
      </div>
      <footer>
        <Link href="/">Back to the table</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes your profile, handle, friendships, ratings you gave
              or received, sign-in connections, and saved seat access, and ends
              any games you host. Finished games stay in other players’ records,
              no longer linked to your account. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="field">
            Type DELETE to confirm
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <button
              className="danger"
              disabled={busy || confirm !== 'DELETE'}
              onClick={() => void performAction('delete')}
            >
              Delete account
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
