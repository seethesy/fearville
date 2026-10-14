'use client';
import { useState } from 'react';
import { HubShell } from '@/components/hub/shell';
import type { Fixture } from '@/lib/staging/fixtures';

async function post(body: object) {
  const r = await fetch('/api/staging', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw Error(data.error || 'Request failed.');
  return data;
}

export function ReviewPanel({ fixtures }: { fixtures: Fixture[] }) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const run = async (key: string, body: object, then: string) => {
    setBusy(key);
    setError('');
    try {
      await post(body);
      window.location.href = then;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy('');
    }
  };
  return (
    <HubShell
      active="staging"
      title="UI review"
      subtitle="Staging only. Each table is reset to its named state when opened."
    >
      <section className="panel stack">
        <p className="eyebrow">Demo account</p>
        <p className="muted">
          Signs this browser in as QA Demo: friends, an incoming and outgoing
          request, a blocked player, a table invitation, game history and
          Storyteller feedback.
        </p>
        <button
          className="primary"
          disabled={!!busy}
          onClick={() => run('demo', { action: 'demo' }, '/friends')}
        >
          {busy === 'demo' ? 'Signing in…' : 'Sign in as the demo account'}
        </button>
      </section>
      <section className="panel stack">
        <p className="eyebrow">Tables</p>
        <p className="hint">
          You join as the Storyteller of a Sandbox table. Use the Sandbox point
          of view switcher to see any seat. Use a browser that is not signed in
          as the admin account.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {fixtures.map((f) => (
          <div className="friend-row" key={f.id}>
            <div>
              <strong>{f.title}</strong>
              <p className="muted">
                {f.description} · <code>{f.code}</code>
              </p>
            </div>
            <div className="row-actions">
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() =>
                  run(f.id, { action: 'open', fixture: f.id }, '/table')
                }
              >
                {busy === f.id ? 'Loading…' : 'Open'}
              </button>
            </div>
          </div>
        ))}
      </section>
    </HubShell>
  );
}
