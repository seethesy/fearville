'use client';
import AppLink from '@/components/app-link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  Ghost,
  Users,
  Moon,
  Swords,
  WandSparkles,
  BookOpen,
} from 'lucide-react';
import { AccountPanel } from '@/components/account-panel';
import { useAccount, accountAction } from '@/components/hub/account-context';
import { Brand, HubShell } from '@/components/hub/shell';
import { RulesBrowser } from '@/components/hub/rules-browser';

function inviteCode() {
  const join = new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? '';
  return /^(?:[0-9]{6}|[A-Z]{6})$/.test(join) ? join : '';
}

function subscribeInvite(changed: () => void) {
  window.addEventListener('popstate', changed);
  return () => window.removeEventListener('popstate', changed);
}

export default function Home() {
  const { state, error: accountError } = useAccount();
  const [guest, setGuest] = useState(false),
    [custom, setCustom] = useState(false),
    [entryTab, setEntryTab] = useState('join');
  const [name, setName] = useState('');
  const sharedCode = useSyncExternalStore(subscribeInvite, inviteCode, () => '');
  const [enteredCode, setCode] = useState<string>();
  const code = enteredCode ?? sharedCode;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [session, setSession] = useState<{
    code: string;
    phase: string;
  } | null>(null);
  useEffect(() => {
    const load = () => {
      void fetch('/api/session', { cache: 'no-store' })
        .then(async (r) => {
          if (r.ok) setSession(await r.json());
          else if (r.status === 401) setSession(null);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener('pageshow', load);
    const timer = setTimeout(() => {
      setGuest(sessionStorage.getItem('fearville-guest') === 'true');
      const reason = new URLSearchParams(location.search).get('error');
      if (reason) setError(reason);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pageshow', load);
    };
  }, []);
  async function enter(action: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          name,
          code,
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Could not connect.');
      location.assign('/table');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
      setBusy(false);
    }
  }
  const signedIn = !!state?.account;
  const join = (
    <form
      className="join-form"
      onSubmit={(e) => {
        e.preventDefault();
        void enter('join');
      }}
    >
      {!signedIn && (
        <label className="field">
          Lobby name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            placeholder="What should we call you?"
            autoComplete="off"
            required
          />
        </label>
      )}
      <label className="field">
        Session code
        <input
          className="code-input"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())
          }
          placeholder="000000"
          maxLength={6}
          minLength={6}
          inputMode="numeric"
          autoComplete="off"
          required
        />
      </label>
      <button
        className="primary full"
        disabled={busy || code.length !== 6 || (!signedIn && !name.trim())}
      >
        {busy ? 'Joining…' : 'Join game'}
        <ArrowRight size={18} />
      </button>
      <p className="hint">Enter the 6-digit code from your Storyteller.</p>
    </form>
  );
  const saved = session && (
    <div className="resume-banner">
      <div>
        <strong>Your table is waiting</strong>
        <small>
          {session.phase === 'lobby' ? 'Lobby' : 'Game in progress'}
        </small>
      </div>
      <AppLink className="primary" href="/table">
        {session.phase === 'lobby' ? 'Rejoin lobby' : 'Return to game'}
        <ArrowRight size={16} />
      </AppLink>
    </div>
  );
  const status = (
    <>
      {(error || accountError) && (
        <p className="error" role="alert">
          {error || accountError}
        </p>
      )}
    </>
  );
  if (!state && !accountError)
    return (
      <div className="hub hub-loading">
        <Brand />
        <output>Opening the gates…</output>
      </div>
    );
  if (signedIn)
    return (
      <HubShell
        active="Play"
        title="Choose your game."
        subtitle="Gather the town. The night is yours."
      >
        {saved}
        <div className="play-layout">
          <section className="panel play-card">
            <p className="eyebrow">PLAY FEARVILLE</p>
            <div className="mode-stack">
              {[
                { name: 'Standard', Icon: PlayIcon },
                { name: 'Quickplay', Icon: Swords },
                { name: 'Rated', Icon: Users },
              ].map(({ name: mode, Icon }) => (
                <button className="mode-button" key={mode} disabled>
                  <Icon size={24} />
                  <span>{mode}</span>
                  <small>Coming soon</small>
                </button>
              ))}
              <button
                className="mode-button mode-custom"
                aria-expanded={custom}
                onClick={() => setCustom(!custom)}
              >
                <WandSparkles size={24} />
                <span>Custom</span>
                <ArrowRight size={20} />
              </button>
            </div>
            {custom && (
              <div className="custom-options">
                <p>Storytell a private game or practice in the sandbox.</p>
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={() => void enter('create')}
                >
                  Create a lobby
                </button>
                <button
                  className="secondary full"
                  disabled={busy}
                  onClick={() => void enter('createSandbox')}
                >
                  Open sandbox
                </button>
                <p className="hint">
                  Sandbox includes practice players and no timers.
                </p>
              </div>
            )}
            <div className="join-below">
              <h2>Have a code? Join below!</h2>
              {join}
            </div>
            {status}
          </section>
          <aside className="play-aside">
            <section className="panel">
              <Moon className="accent-icon" size={30} />
              <h2>A familiar face.</h2>
              <p className="muted">
                You will join as{' '}
                <strong>
                  {state.profile?.lobbyName || state.account?.name}
                </strong>
                , with your saved avatar and death animation.
              </p>
              <AppLink href="/account" className="quiet-link">
                Edit your profile →
              </AppLink>
            </section>
            <section className="panel">
              <h2>Saved lobbies</h2>
              {state.seats.length ? (
                state.seats.map((seat) => (
                  <div className="saved-game" key={seat.id}>
                    <div>
                      <strong>{seat.code}</strong>
                      <small>
                        {seat.host ? 'Storyteller' : seat.hostName + '’s table'}{' '}
                        · {seat.phase}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await accountAction({
                            action: 'resume',
                            seat: seat.id,
                          });
                          location.assign('/table');
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : 'Could not resume.',
                          );
                          setBusy(false);
                        }
                      }}
                    >
                      Rejoin
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Your lobbies appear here after you create or join one.
                </p>
              )}
            </section>
            <AppLink className="learn-link" href="/rules">
              <BookOpen size={20} /> Brush up on the rules{' '}
              <ArrowRight size={16} />
            </AppLink>
          </aside>
        </div>
      </HubShell>
    );
  return (
    <div className={'hub public-home ' + (guest ? 'guest-selected' : '')}>
      <header className="public-header">
        <Brand />
        <AppLink className="quiet-link" href="#signin">
          Sign in
        </AppLink>
      </header>
      <nav className="public-nav" aria-label="Explore Fearville">
        <AppLink href="#play">Play</AppLink>
        <AppLink href="#about">What is Fearville?</AppLink>
        <AppLink href="#rules">Rules</AppLink>
        <AppLink href="#scripts">Scripts</AppLink>
      </nav>
      <main>
        <section id="play" className="public-play">
          <div className="public-heading">
            <p className="eyebrow">A TOWN FULL OF SECRETS</p>
            <h1>Welcome to Fearville.</h1>
            <p className="muted">
              A game of hidden roles, tall tales, and suspicious friends.
            </p>
          </div>
          <section id="signin" className="signin-section">
            <AccountPanel compact />
            <button
              className="secondary guest-button"
              onClick={() => {
                setGuest(true);
                sessionStorage.setItem('fearville-guest', 'true');
              }}
            >
              Continue as guest
              <ArrowRight size={18} />
            </button>
          </section>
          <section className="panel public-entry" aria-label="Enter a game">
            {saved}
            <fieldset className="entry-switch" aria-label="Choose how to play">
              <button
                className={entryTab === 'join' ? 'active' : ''}
                onClick={() => setEntryTab('join')}
              >
                Join a game
              </button>
              <button
                className={
                  entryTab === 'host' ? 'active guest-host' : 'guest-host'
                }
                onClick={() => setEntryTab('host')}
              >
                Storytell
              </button>
            </fieldset>
            {entryTab === 'join' ? (
              <>
                <h2>There is a seat for you.</h2>
                {join}
              </>
            ) : (
              <div className="host-signin">
                <Ghost size={36} />
                <h2>Bring the town together.</h2>
                <p>
                  Sign in above to create a lobby or open the sandbox. Your
                  account keeps your games and Storyteller record together.
                </p>
                <AppLink className="primary full" href="#signin">
                  Sign in to storytell
                </AppLink>
              </div>
            )}
            {status}
          </section>
        </section>
        <section id="about" className="public-section">
          <p className="eyebrow">TRUST IS A DANGEROUS THING</p>
          <h2>What is Fearville?</h2>
          <p className="section-lead">
            A social deduction game for 5–18 players and one Storyteller. A
            hidden Horror haunts your town. Talk, bluff, and piece together
            clues before evil takes over.
          </p>
          <div className="about-grid">
            <article>
              <Users />
              <h3>Gather your people</h3>
              <p>
                Play together, each with a phone or browser. A neutral
                Storyteller guides the game and handles secret information.
              </p>
            </article>
            <article>
              <Moon />
              <h3>Survive the night</h3>
              <p>
                Discover your secret role. Use your ability, question your
                neighbors, and decide whose story you believe.
              </p>
            </article>
            <article>
              <Ghost />
              <h3>Stay in the story</h3>
              <p>
                Death does not end your game. Keep talking, save your final
                vote, and win alongside your team.
              </p>
            </article>
          </div>
        </section>
        <section id="rules" className="public-section">
          <p className="eyebrow">YOUR FIRST NIGHT</p>
          <h2>The rules of the town.</h2>
          <div className="about-grid">
            <article>
              <h3>01 / Day & night</h3>
              <p>
                During the day, share information and bluff. At night, act
                privately when the Storyteller prompts you.
              </p>
            </article>
            <article>
              <h3>02 / Nominate & vote</h3>
              <p>
                Living players can nominate once each day. An execution needs at
                least half the living players to vote, with the highest
                qualifying tally. Ties mean no execution.
              </p>
            </article>
            <article>
              <h3>03 / Find the Horror</h3>
              <p>
                Good wins by killing the Horror. Evil usually wins with only two
                players alive. Specific abilities can change the outcome.
              </p>
            </article>
          </div>
          <AppLink className="secondary" href="/rules">
            Read the complete rulebook
            <BookOpen size={18} />
          </AppLink>
        </section>
        <section id="scripts" className="public-section">
          <p className="eyebrow">EVERY TOWN HAS ITS CHARACTERS</p>
          <h2>Choose a script.</h2>
          <p className="muted">
            Each script brings its own cast and combinations. Explore every role
            below.
          </p>
          <RulesBrowser rolesOnly />
        </section>
      </main>
      <footer className="hub-footer">
        <Brand />
        <AppLink href="/privacy">Privacy</AppLink>
        <AppLink href="/rules">Rulebook</AppLink>
      </footer>
    </div>
  );
}
function PlayIcon({ size }: { size: number }) {
  return <Ghost size={size} />;
}
