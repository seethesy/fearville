'use client';
import Link from 'next/link';
import { AccountPanel } from '@/components/account-panel';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
export default function Home() {
  const [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [recoveryKey, setRecoveryKey] = useState(''),
    [entryTab, setEntryTab] = useState('join'),
    [session, setSession] = useState<{
      code: string;
      host: boolean;
      name: string;
      phase: string;
    } | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch('/api/session', { cache: 'no-store' });
        if (!r.ok) {
          if (live && r.status === 401) setSession(null);
          return;
        }
        const d = (await r.json()) as {
          code: string;
          host: boolean;
          name: string;
          phase: string;
        };
        if (live)
          setSession({
            code: d.code,
            host: d.host,
            name: d.name,
            phase: d.phase,
          });
      } catch {
        /* Keep the existing return link available during a disconnect. */
      }
    };
    const resume = () => {
      if (!document.hidden) void load();
    };
    void load();
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      live = false;
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
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
          ...(action === 'restore' ? { recoveryKey: recoveryKey.trim() } : {}),
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Could not connect.');
      location.assign('/table');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="entry">
      <header className="brand">
        <span className="brand-mark">F</span>
        <span>FEARVILLE</span>
        <span className="edition">IN PERSON</span>
      </header>
      <div className="entry-grid">
        <section className="intro">
          <p className="eyebrow">FEARVILLE CLASSIC</p>
          <h1>
            A seat at
            <br />
            the table.
          </h1>
          <p className="lead">
            Gather your players. Keep your secrets.
            <br />
            Let the Storyteller lead the night.
          </p>
          <div className="chapter">
            <span>01</span>
            <div>
              <strong>One room. One shared game.</strong>
              <p>
                Join on your own device for private roles, night information,
                and voting.
              </p>
            </div>
          </div>
          <div className="chapter">
            <span>02</span>
            <div>
              <strong>The Storyteller stays in control.</strong>
              <p>
                A guided night order and timed days, with room for every ruling.
              </p>
            </div>
          </div>
          <Link className="quiet-link" href="/table">
            Return to your session →
          </Link>
          <Link className="quiet-link" href="/rules">
            Read the rules & roles →
          </Link>
        </section>
        <section className="panel entry-panel">
          {session && (
            <section
              className="resume-session"
              aria-label="Your current session"
            >
              <p className="eyebrow">YOUR SEAT IS SAVED</p>
              <h2>
                {session.host
                  ? 'Return as Storyteller.'
                  : `Welcome back, ${session.name}.`}
              </h2>
              <p className="muted">
                Session {session.code}. Closing this tab or switching apps does
                not give up your seat.
              </p>
              <Link className="primary full resume-link" href="/table">
                {session.phase === 'lobby' ? 'Rejoin lobby' : 'Return to game'}{' '}
                →
              </Link>
            </section>
          )}
          <AccountPanel compact />
          <p className="eyebrow">TAKE YOUR PLACE</p>
          <Tabs
            value={entryTab}
            onValueChange={(value) => setEntryTab(String(value))}
          >
            <TabsList className="wide-tabs">
              <TabsTrigger value="join">Join a game</TabsTrigger>
              <TabsTrigger value="host">Storytell</TabsTrigger>
              <TabsTrigger value="return">Rejoin</TabsTrigger>
            </TabsList>
            {entryTab !== 'return' && (
              <label className="field">
                Your name
                <input
                  maxLength={32}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name at the table"
                  autoComplete="off"
                />
              </label>
            )}
            <TabsContent value="join">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enter('join');
                }}
              >
                <label className="field">
                  Session code
                  <input
                    className="code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="ABCDEF"
                    autoCapitalize="characters"
                    required
                  />
                </label>
                <button
                  className="primary full"
                  disabled={busy || !name.trim() || code.length !== 6}
                >
                  {busy ? 'Connecting…' : 'Join the table →'}
                </button>
                <p className="hint">
                  Ask your Storyteller for the six-letter code.
                </p>
              </form>
            </TabsContent>
            <TabsContent value="host">
              <h2>Bring the town together.</h2>
              <p className="muted">
                Create a private session, invite 5–18 players, then assign
                characters and set your timers.
              </p>
              <button
                className="primary full"
                disabled={busy || !name.trim()}
                onClick={() => void enter('create')}
              >
                {busy ? 'Creating…' : 'Create a lobby →'}
              </button>
              <button
                className="secondary full"
                disabled={busy || !name.trim()}
                onClick={() => void enter('createSandbox')}
              >
                {busy ? 'Creating…' : 'Open Sandbox →'}
              </button>
              <p className="hint">
                A lobby gives you one reusable code and keeps everyone’s seats
                between games. Sandbox makes you the Storyteller, lets you add
                dummy players and switch between their private views, with all
                timers disabled.
              </p>
            </TabsContent>
            <TabsContent value="return">
              <h2>Return to your seat.</h2>
              <p className="muted">
                On the same browser, use Return to your session. On a different
                device or after clearing browser data, use your private recovery
                key or sign in to your saved account.
              </p>
              <Link className="secondary full resume-link" href="/table">
                Return to your session →
              </Link>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void enter('restore');
                }}
              >
                <label className="field">
                  Private recovery key
                  <input
                    type="password"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    required
                  />
                </label>
                <button
                  className="primary full"
                  disabled={busy || !recoveryKey.trim()}
                >
                  {busy ? 'Restoring…' : 'Restore my seat'}
                </button>
              </form>
              <Link className="quiet-link" href="/account">
                Account & saved games →
              </Link>
              <p className="hint">
                Players and Storytellers can both return. A session code alone
                cannot restore someone’s private seat.
              </p>
            </TabsContent>
          </Tabs>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      </div>
      <footer>An in-person game companion.</footer>
    </main>
  );
}
