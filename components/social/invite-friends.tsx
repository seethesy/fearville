'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { social, load, display, type TableSocial } from './api';

// Lobby panel: every seated, signed-in player can invite their friends.
export function InviteFriends({ code }: { code: string }) {
  const [state, setState] = useState<TableSocial | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const refresh = useCallback(async () => {
    try {
      setState(await load<TableSocial>('/api/social/table?code=' + code));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load friends.');
    }
  }, [code]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 10000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [refresh]);
  async function invite(account: string) {
    setBusy(account);
    setError('');
    try {
      await social({ action: 'invite', code, account });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation failed.');
    } finally {
      setBusy('');
    }
  }
  if (!state) return null;
  if (!state.account)
    return (
      <div className="social-inline">
        <p className="eyebrow">INVITE FRIENDS</p>
        <p className="muted">
          <Link href="/account">Sign in</Link> to invite your friends to this
          table with one tap.
        </p>
      </div>
    );
  return (
    <div className="social-inline">
      <div className="section-heading">
        <p className="eyebrow">INVITE FRIENDS</p>
        <Link className="text-action" href="/friends">
          Manage friends
        </Link>
      </div>
      {state.friends.length === 0 ? (
        <p className="muted">
          Add friends by handle on your{' '}
          <Link href="/friends">Friends page</Link>, then invite them here.
        </p>
      ) : (
        <div className="friend-rows">
          {state.friends.map((f) => (
            <div key={f.id} className="friend-row">
              <div>
                <strong>{f.name}</strong>
                <small>
                  {display(f)}
                  {f.together
                    ? ` · ${f.together} game${f.together === 1 ? '' : 's'} together`
                    : ''}
                </small>
              </div>
              {f.seated ? (
                <span className="status-pill">At the table</span>
              ) : !f.invitesAllowed ? (
                <span className="status-pill">Invitations disabled</span>
              ) : f.invite?.status === 'pending' ? (
                <span className="status-pill">Invited</span>
              ) : (
                <button
                  className="secondary"
                  disabled={busy === f.id}
                  onClick={() => void invite(f.id)}
                >
                  {f.invite?.status === 'declined' ? 'Invite again' : 'Invite'}
                </button>
              )}
            </div>
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
