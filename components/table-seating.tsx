'use client';
import { useRef, useState } from 'react';
import { ROLES } from '@/lib/game/types';
import { RoleIcon } from './role-icon';
import type { GameView } from '@/lib/game/view';

export function TableSeating({
  game,
  refresh,
}: {
  game: GameView;
  refresh: () => Promise<void>;
}) {
  const ring = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; seat: number } | null>(null);
  const ids = order ?? game.players.map((p) => p.id);
  function reordered(id: string, seat: number) {
    const next = ids.filter((p) => p !== id);
    next.splice(seat - 1, 0, id);
    return next;
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function move(player: string, seat: number) {
    setOrder(reordered(player, seat));
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
      setOrder(null);
    }
  }
  return (
    <section className="panel seating-panel">
      <h2>Seating order</h2>
      <p className="muted">
        Move players around the table. Changes save immediately and everyone
        sees the same order.
      </p>
      <div className="seat-circle-scroll">
        <div
          className="seat-circle"
          ref={ring}
          style={{
            minWidth: game.players.length > 8 ? game.players.length * 40 : 0,
          }}
        >
          <div className="circle-center">
            The table
            <br />
            <small>Drag seats clockwise</small>
          </div>
          {ids.map((id, i) => {
            const p = game.players.find((p) => p.id === id);
            if (!p) return null;
            const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
            return (
              <button
                key={p.id}
                className={`circle-seat ${drag?.id === p.id ? 'dragging' : ''}`}
                style={{
                  left: `${50 + 35 * Math.cos(angle)}%`,
                  top: `${50 + 35 * Math.sin(angle)}%`,
                }}
                disabled={busy}
                aria-label={`Move seat ${i + 1}: ${p.name}`}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDrag({ id: p.id, seat: i + 1 });
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.id !== p.id || !ring.current) return;
                  const box = ring.current.getBoundingClientRect();
                  const angle =
                    (Math.atan2(
                      e.clientY - box.top - box.height / 2,
                      e.clientX - box.left - box.width / 2,
                    ) +
                      Math.PI / 2 +
                      2 * Math.PI) %
                    (2 * Math.PI);
                  const seat =
                    (Math.round(angle / ((2 * Math.PI) / ids.length)) %
                      ids.length) +
                    1;
                  if (seat !== drag.seat) {
                    setOrder(reordered(p.id, seat));
                    setDrag({ id: p.id, seat });
                  }
                }}
                onPointerUp={() => {
                  if (!drag) return;
                  const seat = drag.seat;
                  setDrag(null);
                  if (seat !== p.seat) void move(p.id, seat);
                  else setOrder(null);
                }}
                onPointerCancel={() => {
                  setDrag(null);
                  setOrder(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const seat = Math.min(
                      ids.length,
                      Math.max(1, i + 1 + (e.key === 'ArrowRight' ? 1 : -1)),
                    );
                    if (seat !== p.seat) void move(p.id, seat);
                  }
                }}
              >
                <span>
                  {i + 1}. {p.name}
                </span>
                <small>
                  <RoleIcon role={p.role ?? ''} /> (
                  {ROLES.find((r) => r.id === p.role)?.name ?? 'Unassigned'})
                </small>
              </button>
            );
          })}
        </div>
      </div>
      <details>
        <summary>Move seats with buttons or seat numbers</summary>
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
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
