'use client';
import { useState } from 'react';
import type { GameView } from '@/lib/game/view';

export function TableSeating({
  game,
  refresh,
}: {
  game: GameView;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function move(player: string, seat: number) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'moveSeat',
          player,
          seat,
          version: game.version,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error || 'Unable to move this seat.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel seating-panel">
      <h2>Seating order</h2>
      <p className="muted">
        Move players around the table. Changes save immediately and everyone
        sees the same order.
      </p>
      {game.players.map((p, i) => (
        <div className="membership-row" key={p.id}>
          <span>
            {p.seat}. {p.name}
          </span>
          <div className="actions">
            <button
              className="secondary"
              aria-label={`Move ${p.name} earlier`}
              disabled={busy || i === 0}
              onClick={() => void move(p.id, p.seat - 1)}
            >
              ↑
            </button>
            <button
              className="secondary"
              aria-label={`Move ${p.name} later`}
              disabled={busy || i === game.players.length - 1}
              onClick={() => void move(p.id, p.seat + 1)}
            >
              ↓
            </button>
            <select
              aria-label={`Move ${p.name} to seat`}
              value={p.seat}
              disabled={busy}
              onChange={(e) => void move(p.id, Number(e.target.value))}
            >
              {game.players.map((q) => (
                <option key={q.id} value={q.seat}>
                  Seat {q.seat}
                </option>
              ))}
            </select>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
