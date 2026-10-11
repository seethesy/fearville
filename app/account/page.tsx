'use client';
import AppLink from '@/components/app-link';
import { useEffect, useState } from 'react';
import { HubShell } from '@/components/hub/shell';
import { AccountPanel } from '@/components/account-panel';
import { useAccount, accountAction } from '@/components/hub/account-context';
import { ProfileEditor } from '@/components/hub/profile-editor';
import { SettingsPanel } from '@/components/hub/settings';
import { useSectionTutorial } from '@/components/tutorials/provider';
import { ResetTutorials } from '@/components/tutorials/help-menu';
import {
  Record,
  RecentGames,
  stars,
  type Stats,
  type RecentGame,
} from '@/components/social/record';
import { load, when } from '@/components/social/api';
import { ReportDialog } from '@/components/social/report-dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
type View = {
  stats: Stats;
  recent: RecentGame[];
  ratings: {
    stars: number;
    comment: string;
    created: number;
    code: string;
    players: number;
    ref?: string | null;
  }[];
};
export default function Account() {
  const { state, refresh, error: accountError } = useAccount();
  const [view, setView] = useState<View | null>(null),
    [tab, setTab] = useState('profile'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState(''),
    [reportingRating, setReportingRating] = useState<string | null>(null);
  // /stats opens the History tab of this page.
  useSectionTutorial(tab === 'history' ? 'stats' : 'account');
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(location.search);
      setTab(
        query.get('tab') === 'history'
          ? 'history'
          : query.get('tab') === 'settings'
            ? 'settings'
            : 'profile',
      );
      if (query.get('error')) setError(query.get('error')!);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const accountId = state?.account?.id;
  useEffect(() => {
    let live = true;
    if (accountId)
      void load<View>('/api/social')
        .then((data) => {
          if (live) setView(data);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [accountId]);
  async function act(action: string, seat?: string) {
    setBusy(true);
    setError('');
    try {
      await accountAction({ action, seat, confirm });
      if (action === 'resume') location.assign('/table');
      else if (action === 'signout' || action === 'delete')
        location.assign('/');
      else await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update account.');
    } finally {
      setBusy(false);
    }
  }
  function selectTab(value: string) {
    setTab(value);
    history.replaceState(null, '', '/account?tab=' + value);
  }
  return (
    <HubShell
      active="Account"
      title={
        tab === 'settings' ? 'Your preferences.' : 'Your place in the town.'
      }
      settings
    >
      <fieldset className="account-tabs" aria-label="Account sections">
        <button
          className={tab === 'profile' ? 'active' : ''}
          onClick={() => selectTab('profile')}
        >
          Profile
        </button>
        <button
          className={tab === 'history' ? 'active' : ''}
          onClick={() => selectTab('history')}
        >
          History
        </button>
        {tab === 'settings' && (
          <button className="active" onClick={() => selectTab('settings')}>
            Settings
          </button>
        )}
      </fieldset>
      {(error || accountError) && (
        <p className="error" role="alert">
          {error || accountError}
        </p>
      )}
      {!state ? (
        <output>Loading your account…</output>
      ) : !state.account ? (
        <section className="panel">
          <h2>Make yourself at home.</h2>
          <AccountPanel />
          <AppLink className="quiet-link" href="/">
            Continue as guest →
          </AppLink>
        </section>
      ) : (
        <>
          {tab === 'profile' && (
            <>
              <ProfileEditor key={state.account.id} />
              {view && (
                <section className="panel section-gap">
                  <h2>Your record</h2>
                  <Record stats={view.stats} />
                  <p className="hint">
                    Completed games count once. MVP rewards update as votes
                    arrive.
                  </p>
                </section>
              )}
            </>
          )}
          {tab === 'history' && (
            <div className="stack">
              <section className="panel">
                <h2>Saved lobbies</h2>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void act('attach')}
                >
                  Save the seat on this device
                </button>
                {state.seats.length ? (
                  state.seats.map((s) => (
                    <article className="saved-game" key={s.id}>
                      <div>
                        <strong>{s.code}</strong>
                        <small>
                          {s.host ? 'Storyteller' : s.hostName + '’s table'} ·{' '}
                          {s.phase}
                        </small>
                      </div>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void act('resume', s.id)}
                      >
                        Rejoin
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="muted">No saved lobbies yet.</p>
                )}
              </section>
              <section className="panel">
                <h2>Past games</h2>
                {view ? (
                  <RecentGames games={view.recent} />
                ) : (
                  <p>Loading game history…</p>
                )}
              </section>
              {view && (
                <section className="panel">
                  <h2>Storyteller feedback</h2>
                  <p>
                    {stars(view.stats.storyteller.rating)} from{' '}
                    {view.stats.storyteller.ratings} ratings
                  </p>
                  {view.ratings.length ? (
                    view.ratings.map((r, i) => (
                      <article className="friend-row" key={i}>
                        <div>
                          <strong>{'★'.repeat(r.stars)}</strong>
                          <small>
                            {when(r.created)} · {r.code} · {r.players} players
                          </small>
                          {r.comment && <p>{r.comment}</p>}
                        </div>
                        {r.ref && (
                          <button
                            className="quiet-link"
                            onClick={() => setReportingRating(r.ref ?? null)}
                          >
                            Report
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <p className="muted">
                      Player feedback appears after you storytell. Comments are
                      visible only to you.
                    </p>
                  )}
                </section>
              )}
            </div>
          )}
          {tab === 'settings' && (
            <div className="settings-layout">
              <SettingsPanel />
              <ResetTutorials />
              <section className="panel">
                <h2>Account & connections</h2>
                <p className="muted">{state.account.email}</p>
                <AccountPanel />
                <div className="stack section-gap">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void act('signout')}
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
              </section>
            </div>
          )}
        </>
      )}
      {reportingRating && (
        <ReportDialog
          open
          onOpenChange={(open) => !open && setReportingRating(null)}
          title="Report this comment"
          target={{ kind: 'rating', ref: reportingRating }}
        />
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your profile, friends, saved seats, and
              sign-in connections, and closes games you host. Finished games
              remain in other players’ records without your account link.
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
              onClick={() => void act('delete')}
            >
              Delete account
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </HubShell>
  );
}
