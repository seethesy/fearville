'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { load, social, type PublicAccount } from '@/components/social/api';
import { Record, type Stats } from '@/components/social/record';

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
  games: number;
  stats: Stats | null;
  together: number;
};

// Public player profile, addressed by handle: /profile?handle=name
export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [handle, setHandle] = useState('');
  async function refresh(h: string) {
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
              {profile.games} game{profile.games === 1 ? '' : 's'} played
              {profile.together ? ` · ${profile.together} with you` : ''}
            </p>
            <div className="actions">
              {profile.relation === 'none' && (
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
                <span className="status-pill">Friends</span>
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
                Records are shared between friends. Send a request to see this
                player’s wins, characters, and storytelling rating.
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
