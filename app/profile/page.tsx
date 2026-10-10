'use client';
import { useSectionTutorial } from '@/components/tutorials/provider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { load, social, type PublicAccount } from '@/components/social/api';
import {
  Record,
  RecentGames,
  type Stats,
  type RecentGame,
} from '@/components/social/record';

type Profile = {
  account: PublicAccount;
  relation:
    | 'self'
    | 'none'
    | 'friends'
    | 'requested'
    | 'incoming'
    | 'blocked'
    | 'unavailable';
  games: number | null;
  canRequest: boolean;
  recent: RecentGame[] | null;
  stats: Stats | null;
  together: number;
};

// Public player profile, addressed by handle: /profile?handle=name
export default function ProfilePage() {
  useSectionTutorial('profile');
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [handle, setHandle] = useState('');
  async function refresh(h: string) {
    setProfile(null);
    try {
      setProfile(await load<Profile>('/api/social/profile?handle=' + h));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
    }
  }
  useEffect(() => {
    const id = setTimeout(() => {
      const h = new URLSearchParams(location.search).get('handle') || '';
      setHandle(h);
      if (h) void refresh(h);
      else setError('No player selected.');
    }, 0);
    return () => clearTimeout(id);
  }, []);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await social(body);
      await refresh(handle);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }
  const a = profile?.account;
  return (
    <main className="entry">
      <header className="brand">
        <Link className="brand-mark" href="/">
          F
        </Link>
        <span>FEARVILLE</span>
        <span className="edition">PLAYER</span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {profile && a && (
        <div className="account-layout">
          <section className="panel">
            <p className="eyebrow">@{a.handle}</p>
            <h1>{a.name}</h1>
            <p className="muted">
              {profile.games === null
                ? 'Statistics are private.'
                : `${profile.games} game${profile.games === 1 ? '' : 's'} played`}
              {profile.together ? ` · ${profile.together} with you` : ''}
            </p>
            <div className="actions">
              {profile.canRequest && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void act({ action: 'request', handle: a.handle })
                  }
                >
                  Send friend request
                </button>
              )}
              {profile.relation === 'none' && !profile.canRequest && (
                <span className="status-pill">
                  Not accepting friend requests
                </span>
              )}
              {profile.relation === 'incoming' && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void act({ action: 'accept', account: a.id })}
                >
                  Accept friend request
                </button>
              )}
              {profile.relation === 'requested' && (
                <span className="status-pill">Request sent</span>
              )}
              {profile.relation === 'friends' && (
                <>
                  <span className="status-pill">Friends</span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act({ action: 'remove', account: a.id })
                    }
                  >
                    Remove friend
                  </button>
                </>
              )}
              {profile.relation === 'blocked' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void act({ action: 'unblock', account: a.id })}
                >
                  Unblock
                </button>
              )}
              {profile.relation === 'self' && (
                <Link className="quiet-link" href="/stats">
                  This is you. View your full record →
                </Link>
              )}
              {!['self', 'blocked'].includes(profile.relation) && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void act({ action: 'block', account: a.id })}
                >
                  Block player
                </button>
              )}
            </div>
            <Link className="quiet-link" href="/friends">
              ← Back to friends
            </Link>
          </section>
          <section className="panel">
            <p className="eyebrow">RECORD</p>
            {profile.stats ? (
              <Record stats={profile.stats} />
            ) : (
              <p className="muted">
                This player’s statistics are private to you.
              </p>
            )}
          </section>
          <section className="panel">
            <p className="eyebrow">MATCH HISTORY</p>
            {profile.recent ? (
              <RecentGames
                games={profile.recent}
                handle={a.handle ?? undefined}
              />
            ) : (
              <p className="muted">
                This player’s match history is private to you.
              </p>
            )}
          </section>
        </div>
      )}
      <footer>
        <Link href="/">Back to the table</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </main>
  );
}
