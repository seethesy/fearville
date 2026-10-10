'use client';
import { useSectionTutorial } from '@/components/tutorials/provider';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { load, when } from '@/components/social/api';
import {
  Record,
  RecentGames,
  stars,
  type Stats,
  type RecentGame,
} from '@/components/social/record';
import type { AccountView } from '@/components/account-panel';

type View = {
  stats: Stats;
  recent: RecentGame[];
  ratings: {
    stars: number;
    comment: string;
    created: number;
    code: string;
    players: number;
  }[];
};

export default function StatsPage() {
  useSectionTutorial('stats');
  const [account, setAccount] = useState<AccountView['account'] | null>(null),
    [loaded, setLoaded] = useState(false),
    [view, setView] = useState<View | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const me = await load<AccountView>('/api/accounts');
        setAccount(me.account);
        if (me.account) setView(await load<View>('/api/social'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load.');
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <main className="entry">
      <header className="brand">
        <Link className="brand-mark" href="/">
          F
        </Link>
        <span>FEARVILLE</span>
        <span className="edition">YOUR RECORD</span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? null : !account ? (
        <section className="panel recovery-panel">
          <h1>Every game, remembered.</h1>
          <p className="muted">
            Sign in and save your seats to keep a record of wins, characters,
            and storytelling.
          </p>
          <Link className="primary full text-center" href="/account">
            Go to your account →
          </Link>
        </section>
      ) : (
        view && (
          <div className="account-layout">
            <section className="panel">
              <p className="eyebrow">
                {account.handle ? '@' + account.handle : account.name}
              </p>
              <h1>Your record.</h1>
              <Record stats={view.stats} />
              <p className="hint">
                Games count once they end. A seat joined as a guest is added
                when you save it to your account. MVP bonus XP updates as votes
                arrive. Manage statistics and history visibility in your
                account.
              </p>
              <Link className="quiet-link" href="/friends">
                Friends & invitations →
              </Link>
            </section>
            <div className="stack">
              <section className="panel">
                <p className="eyebrow">RECENT GAMES</p>
                <RecentGames games={view.recent} />
              </section>
              <section className="panel">
                <p className="eyebrow">STORYTELLER FEEDBACK</p>
                <h2>
                  {stars(view.stats.storyteller.rating)}
                  <small className="muted">
                    {' '}
                    from {view.stats.storyteller.ratings} rating
                    {view.stats.storyteller.ratings === 1 ? '' : 's'}
                  </small>
                </h2>
                {view.ratings.length === 0 ? (
                  <p className="muted">
                    Players rate you after each game you run while signed in.
                    Comments are visible only to you.
                  </p>
                ) : (
                  <div className="friend-rows">
                    {view.ratings.map((r, i) => (
                      <div key={i} className="friend-row rating-row">
                        <div>
                          <strong>{'★'.repeat(r.stars)}</strong>
                          <small>
                            {when(r.created)} · {r.code} · {r.players} players
                          </small>
                          {r.comment && <p>{r.comment}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )
      )}
      <footer>
        <Link href="/">Back to the table</Link>
        <Link href="/privacy">Privacy</Link>
      </footer>
    </main>
  );
}
