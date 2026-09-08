'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
export default function Home() {
  const [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function enter(action: string) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name, code }),
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
        <span className="brand-mark">CT</span>
        <span>
          CLOCKTOWER <b>TABLE</b>
        </span>
        <span className="edition">IN PERSON</span>
      </header>
      <div className="entry-grid">
        <section className="intro">
          <p className="eyebrow">TROUBLE BREWING</p>
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
        </section>
        <section className="panel entry-panel">
          <p className="eyebrow">TAKE YOUR PLACE</p>
          <Tabs defaultValue="join">
            <TabsList className="wide-tabs">
              <TabsTrigger value="join">Join a game</TabsTrigger>
              <TabsTrigger value="host">Storytell</TabsTrigger>
            </TabsList>
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
                Create a private session, invite 5–15 players, then assign
                characters and set your timers.
              </p>
              <button
                className="primary full"
                disabled={busy || !name.trim()}
                onClick={() => void enter('create')}
              >
                {busy ? 'Creating…' : 'Create a session →'}
              </button>
              <p className="hint">
                You’ll receive a code to share with your players.
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
      <footer>
        Unofficial companion for Blood on the Clocktower.
        <Link
          href="https://wiki.bloodontheclocktower.com/Trouble_Brewing"
          target="_blank"
          rel="noreferrer"
        >
          Official script reference ↗
        </Link>
      </footer>
    </main>
  );
}
