'use client';
// FEAR-158: browse the normal UI as a guest, a player or a Storyteller, open a
// private sandbox table in any state, or watch a live table read-only.
import { useEffect, useState } from 'react';
import {
  browseAction,
  loadBrowseCatalog,
  type BrowseCatalog,
} from './browse-client';

const SCRIPTS = [
  { id: 'horrors', label: 'Horrors of Fearville' },
  { id: 'holyMoonStars', label: 'Holy Moon and Stars' },
] as const;

export function BrowsePanel() {
  const [catalog, setCatalog] = useState<BrowseCatalog | null>(null),
    [script, setScript] = useState<'horrors' | 'holyMoonStars'>('horrors'),
    [fixture, setFixture] = useState('lobby'),
    [seats, setSeats] = useState(12),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    loadBrowseCatalog()
      .then(setCatalog)
      .catch((e: Error) => setError(e.message));
  }, []);
  const states =
    catalog?.fixtures.filter((f) => f.scripts.includes(script)) ?? [];
  const chosen = states.find((f) => f.id === fixture) ?? states[0];
  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError('');
    try {
      await browseAction(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      setBusy('');
    }
  };
  return (
    <section className="panel">
      <h2>Browse the app</h2>
      <p>
        See every screen as players do. While browsing, an ADMIN VIEW banner
        stays on screen; use it to switch viewer or come back here. Every
        switch, sandbox and observed table is recorded in the audit log.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <h3>View as</h3>
      <p className="hint">
        Player and Storyteller use the synthetic demo account (friends, history,
        ratings). Its accounts have no handles in production, so real players
        can never find them. Pages are read-only.
      </p>
      <div className="admin-actions">
        {(
          [
            ['guest', 'Guest'],
            ['player', 'Player'],
            ['storyteller', 'Storyteller'],
          ] as const
        ).map(([viewer, label]) => (
          <button
            key={viewer}
            className="secondary"
            disabled={!!busy}
            onClick={() => void run(viewer, { op: 'view', viewer })}
          >
            {busy === viewer ? 'Opening…' : label}
          </button>
        ))}
      </div>

      <h3>Sandbox table</h3>
      <p className="hint">
        Your private table with dummy seats, reset to the chosen state each
        time. You are its Storyteller and can switch to any seat. Sandbox games
        never count toward history, stats, ranked or trust.
      </p>
      <form
        className="admin-browse-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen)
            void run('sandbox', {
              op: 'sandbox',
              fixture: chosen.id,
              script,
              seats,
            });
        }}
      >
        <label className="field">
          Script
          <select
            value={script}
            onChange={(e) => setScript(e.target.value as typeof script)}
          >
            {SCRIPTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          State
          <select
            value={chosen?.id ?? ''}
            onChange={(e) => setFixture(e.target.value)}
          >
            {states.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Players
          <input
            type="number"
            min={catalog?.seats.min ?? 5}
            max={catalog?.seats.max ?? 18}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
          />
        </label>
        <button className="primary" disabled={!!busy || !chosen}>
          {busy === 'sandbox' ? 'Building…' : 'Open sandbox table'}
        </button>
      </form>
      {chosen && <p className="hint">{chosen.description}</p>}

      <h3>Observe a live table</h3>
      <p className="hint">
        Watch a real game with the Storyteller view, or any seat&apos;s view.
        Strictly read-only: you cannot act, chat or join.
      </p>
      <form
        className="admin-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void run('observe', { op: 'observe', code });
        }}
      >
        <label className="field">
          Table code
          <input
            value={code}
            autoComplete="off"
            maxLength={8}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <button className="primary" disabled={!!busy || !code.trim()}>
          {busy === 'observe' ? 'Opening…' : 'Observe'}
        </button>
      </form>
    </section>
  );
}
