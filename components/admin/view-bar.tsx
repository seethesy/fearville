'use client';
// FEAR-158: shown on every screen while the admin browses the normal UI.
import { useState } from 'react';
import { VIEWER_LABELS, browseAction } from './browse-client';

export function AdminViewBar({ viewer }: { viewer: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await browseAction(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      setBusy(false);
    }
  };
  return (
    <section className="admin-view-bar" aria-label="Admin view">
      <p>
        <strong>ADMIN VIEW</strong>
        <span>{VIEWER_LABELS[viewer] ?? viewer}</span>
        <span className="admin-view-note">
          Read-only outside the sandbox · every switch is audited
        </span>
      </p>
      <div className="admin-view-actions">
        <label>
          <span className="sr-only">View as</span>
          <select
            value={viewer === 'observer' ? '' : viewer}
            disabled={busy}
            onChange={(e) => void run({ op: 'view', viewer: e.target.value })}
          >
            {viewer === 'observer' && (
              <option value="" disabled>
                Observer
              </option>
            )}
            <option value="guest">View as guest</option>
            <option value="player">View as player</option>
            <option value="storyteller">View as Storyteller</option>
          </select>
        </label>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void run({ op: 'exit' })}
        >
          Back to console
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
