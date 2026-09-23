'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  social,
  load,
  display,
  when,
  type PublicAccount,
} from '@/components/social/api';
import type { AccountView } from '@/components/account-panel';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

type Friend = PublicAccount & {
  together: number;
  lastPlayed: number | null;
  since: number;
};
type Invite = {
  id: string;
  code: string;
  expires: number;
  sender: PublicAccount;
  hostName: string;
  players: number;
};
type SocialView = {
  friends: Friend[];
  incoming: (PublicAccount & { created: number })[];
  outgoing: (PublicAccount & { created: number })[];
  blocked: PublicAccount[];
  invites: Invite[];
};

export default function Friends() {
  const [account, setAccount] = useState<AccountView['account'] | null>(null),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState<SocialView | null>(null),
    [handle, setHandle] = useState(''),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      action: 'remove' | 'block';
      account: PublicAccount;
    } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const me = await load<AccountView>('/api/accounts');
      setAccount(me.account);
      if (me.account) {
        setHandle((h) => h || me.account?.handle || '');
        setView(await load<SocialView>('/api/social'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [refresh]);
  async function act(
    body: Record<string, unknown>,
    done?: string | ((data: Record<string, unknown>) => void),
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await social<Record<string, unknown>>(body);
      if (typeof done === 'function') done(data);
      else if (done) setNotice(done);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }
  const person = (a: PublicAccount) => (
    <div>
      <strong>
        {a.handle ? (
          <Link href={'/profile?handle=' + a.handle}>{a.name}</Link>
        ) : (
          a.name
        )}
      </strong>
      <small>{display(a)}</small>
    </div>
  );
  return (
    <main className="entry">
      <header className="brand">
        <Link className="brand-mark" href="/">
          F
        </Link>
        <span>FEARVILLE</span>
        <span className="edition">FRIENDS</span>
      </header>
      {!loaded ? null : !account ? (
        <section className="panel recovery-panel">
          <h1>Find your people.</h1>
          <p className="muted">
            Sign in to choose a handle, add friends, and invite them to your
            tables.
          </p>
          <Link className="primary full text-center" href="/account">
            Go to your account →
          </Link>
        </section>
      ) : (
        <div className="account-layout">
          <section className="panel">
            <p className="eyebrow">YOUR HANDLE</p>
            <h1>{account.handle ? '@' + account.handle : 'Pick a handle.'}</h1>
            <p className="muted">
              Friends find you by handle. It is public; your email never is.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ action: 'handle', handle }, 'Handle saved.');
              }}
            >
              <label className="field">
                Handle
                <input
                  value={handle}
                  maxLength={21}
                  autoComplete="off"
                  placeholder="lowercase, numbers, underscores"
                  onChange={(e) => setHandle(e.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={
                  busy ||
                  !handle.trim() ||
                  handle.replace(/^@/, '') === account.handle
                }
              >
                Save handle
              </button>
            </form>
            <p className="eyebrow section-gap">ADD A FRIEND</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({ action: 'request', handle: search }, (data) => {
                  setSearch('');
                  setNotice(
                    data.status === 'friends'
                      ? 'You are now friends.'
                      : 'Friend request sent.',
                  );
                });
              }}
            >
              <label className="field">
                Their handle
                <input
                  value={search}
                  maxLength={21}
                  autoComplete="off"
                  placeholder="@handle"
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || !search.trim() || !account.handle}
              >
                Send request
              </button>
              {!account.handle && (
                <p className="hint">Choose your own handle first.</p>
              )}
            </form>
            {notice && (
              <div className="notice" aria-live="polite">
                <span>{notice}</span>
                <button onClick={() => setNotice('')} aria-label="Dismiss">
                  Dismiss
                </button>
              </div>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Link className="quiet-link" href="/stats">
              View your record →
            </Link>
            <br />
            <Link className="quiet-link" href="/account">
              Manage account →
            </Link>
          </section>
          <div className="stack">
            {view && view.invites.length > 0 && (
              <section className="panel">
                <p className="eyebrow">INVITATIONS</p>
                <h2>You are wanted at a table.</h2>
                {view.invites.map((i) => (
                  <article key={i.id} className="saved-game">
                    <div>
                      <strong>{i.code}</strong>
                      <p>
                        {i.hostName}’s game · {i.players} seated · invited by{' '}
                        {i.sender.name}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            { action: 'acceptInvite', invite: i.id },
                            () => location.assign('/table'),
                          )
                        }
                      >
                        Join
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act({ action: 'declineInvite', invite: i.id })
                        }
                      >
                        Decline
                      </button>
                    </div>
                  </article>
                ))}
                <p className="hint">
                  Joining seats you under your account name. Invitations expire
                  after a day or when the game starts.
                </p>
              </section>
            )}
            {view && (view.incoming.length > 0 || view.outgoing.length > 0) && (
              <section className="panel">
                <p className="eyebrow">FRIEND REQUESTS</p>
                {view.incoming.map((a) => (
                  <article key={a.id} className="friend-row">
                    {person(a)}
                    <div className="row-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void act({ action: 'accept', account: a.id })
                        }
                      >
                        Accept
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act({ action: 'dismiss', account: a.id })
                        }
                      >
                        Decline
                      </button>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() =>
                          setPending({ action: 'block', account: a })
                        }
                      >
                        Block
                      </button>
                    </div>
                  </article>
                ))}
                {view.outgoing.map((a) => (
                  <article key={a.id} className="friend-row">
                    {person(a)}
                    <div className="row-actions">
                      <span className="status-pill">Waiting</span>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void act({ action: 'dismiss', account: a.id })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )}
            <section className="panel">
              <p className="eyebrow">FRIENDS</p>
              <h2>
                {view?.friends.length
                  ? `${view.friends.length} at your side.`
                  : 'No friends yet.'}
              </h2>
              {view?.friends.length === 0 && (
                <p className="muted">
                  Share your handle with the people you play with, or add theirs
                  above.
                </p>
              )}
              {view?.friends.map((f) => (
                <article key={f.id} className="friend-row">
                  <div>
                    <strong>
                      {f.handle ? (
                        <Link href={'/profile?handle=' + f.handle}>
                          {f.name}
                        </Link>
                      ) : (
                        f.name
                      )}
                    </strong>
                    <small>
                      {display(f)} ·{' '}
                      {f.together
                        ? `${f.together} game${f.together === 1 ? '' : 's'} together` +
                          (f.lastPlayed ? ` · last ${when(f.lastPlayed)}` : '')
                        : 'No games together yet'}
                    </small>
                  </div>
                  <div className="row-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        setPending({ action: 'remove', account: f })
                      }
                    >
                      Remove
                    </button>
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() =>
                        setPending({ action: 'block', account: f })
                      }
                    >
                      Block
                    </button>
                  </div>
                </article>
              ))}
            </section>
            {view && view.blocked.length > 0 && (
              <section className="panel">
                <p className="eyebrow">BLOCKED</p>
                {view.blocked.map((a) => (
                  <article key={a.id} className="friend-row">
                    {person(a)}
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void act({ action: 'unblock', account: a.id })
                      }
                    >
                      Unblock
                    </button>
                  </article>
                ))}
              </section>
            )}
          </div>
        </div>
      )}
      <footer>
        <Link href="/">Back to the table</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === 'block' ? 'Block ' : 'Remove '}
              {pending?.account.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === 'block'
                ? 'They will no longer be able to find you, send requests, or invite you to tables. Any friendship or waiting invitations are withdrawn.'
                : 'You can send a new friend request later. Games you played together stay in both records.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (!pending) return;
                const body = {
                  action: pending.action,
                  account: pending.account.id,
                };
                setPending(null);
                void act(body);
              }}
            >
              {pending?.action === 'block' ? 'Block' : 'Remove'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
