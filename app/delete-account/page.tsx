'use client';
// Public account-deletion page. Google Play requires a web URL where users can
// request deletion; signed-in users can delete here directly.
import { useState } from 'react';
import AppLink from '@/components/app-link';
import { useAccount, accountAction } from '@/components/hub/account-context';

export default function DeleteAccount() {
  const { state } = useAccount();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await accountAction({ action: 'delete', confirm });
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Unable to delete your account.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="entry">
      <section className="panel">
        <p className="eyebrow">FEARVILLE</p>
        <h1>Delete your Fearville account</h1>
        <p>
          You can delete your account at any time, in the app under{' '}
          <strong>Account → Settings → Delete account</strong>, or on this page.
          Deletion takes effect immediately and can’t be undone.
        </p>
        <h2>What is deleted</h2>
        <ul>
          <li>Your email, name, Google or Apple sign-in link, and username</li>
          <li>Your profile, photo, settings and tutorial progress</li>
          <li>Friends, requests, blocks and invitations</li>
          <li>Saved seats and sign-in sessions on every device</li>
          <li>Tables you host, and Storyteller ratings you received</li>
        </ul>
        <h2>What is kept, anonymously</h2>
        <ul>
          <li>
            Finished games stay in other players’ histories with your seat shown
            as “Former player”. Your name, photo, notes and messages are removed
            from recaps.
          </li>
          <li>
            Star ratings you gave a Storyteller stay in their average without
            your comment or any link to you.
          </li>
        </ul>
        {done ? (
          <output>Your account has been deleted.</output>
        ) : state?.account ? (
          <div className="stack section-gap">
            <p className="muted">Signed in as {state.account.email}</p>
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
            <button
              className="danger"
              disabled={busy || confirm !== 'DELETE'}
              onClick={() => void remove()}
            >
              Delete my account
            </button>
          </div>
        ) : (
          <p>
            <AppLink href="/account">Sign in</AppLink> with the Google or Apple
            account you use for Fearville, then come back to this page or use
            Account → Settings. Guests have no account to delete; their seats
            expire on their own.
          </p>
        )}
        <AppLink href="/privacy" className="quiet-link">
          Privacy and account data →
        </AppLink>
      </section>
    </main>
  );
}
