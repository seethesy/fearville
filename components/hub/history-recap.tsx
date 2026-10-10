'use client';
import { useState } from 'react';
import { SessionRecaps } from '@/components/session-recap';
import type { GameView } from '@/lib/game/view';
export function HistoryRecap({ id }: { id: string }) {
  const [recap, setRecap] = useState<Pick<
      GameView,
      'recaps' | 'me' | 'host'
    > | null>(null),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [error, setError] = useState('');
  async function show() {
    if (recap) {
      setOpen(!open);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/social/recap?id=' + encodeURIComponent(id));
      const data = (await r.json()) as Pick<
        GameView,
        'recaps' | 'me' | 'host'
      > & { error?: string };
      if (!r.ok) throw Error(data.error || 'Could not load recap.');
      setRecap(data);
      setOpen(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load recap.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="history-recap">
      <button
        className="secondary"
        disabled={busy}
        aria-expanded={open}
        onClick={() => void show()}
      >
        {busy ? 'Loading recap…' : open ? 'Hide recap' : 'View recap'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open && recap && <SessionRecaps game={recap} expanded />}
    </div>
  );
}
