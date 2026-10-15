'use client';
import { useTableActions, useTableOnline } from '@/hooks/use-table-actions';
import { useState } from 'react';
import { PlayerAvatar } from './player-avatar';
import { SeatChartZoom } from './seat-chart-zoom';
import type { GameView } from '@/lib/game/view';

export function TableSeating({
  game,
  refresh,
}: {
  game: GameView;
  refresh: () => Promise<void>;
}) {
  const actionFetch = useTableActions();
  const online = useTableOnline();
  const [pendingAction, setBusy] = useState(false);
  const busy = pendingAction || !online;
  const [error, setError] = useState('');
  const me = game.players.find((p) => p.id === game.me);
  const count = Math.max(
    5,
    game.players.length,
    ...game.players.map((p) => p.seat),
  );
  const chartSize = Math.max(480, count * 48);
  async function act(action: string, seat?: number) {
    setBusy(true);
    setError('');
    try {
      const response = await actionFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          seat,
          version: game.version,
          ...(game.sandboxHost && !game.host ? { pov: game.me } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw Error(data.error || 'Unable to update your seat.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  return (
    <section className="panel seating-panel">
      <h2>The table</h2>
      <p className="muted">
        {game.host
          ? 'Players choose their own seats.'
          : me?.seat
            ? 'Your seat is saved. Leave it to choose another.'
            : 'Choose an open seat to join the circle.'}
      </p>
      <SeatChartZoom width={chartSize} height={chartSize}>
        <div
          className="seat-circle lobby-circle"
          style={{
            width: chartSize,
            height: chartSize,
            minWidth: chartSize,
          }}
        >
          {!game.host && !!me?.seat && game.phase === 'lobby' && (
            <button
              className="secondary leave-seat"
              disabled={busy}
              onClick={() => void act('leaveSeat')}
            >
              Leave Seat
            </button>
          )}
          <div className="circle-center">
            Fearville
            <br />
            <small>{game.hostName} · Storyteller</small>
          </div>
          {Array.from({ length: count }, (_, i) => {
            const p = game.players.find((p) => p.seat === i + 1);
            const angle = (2 * Math.PI * i) / count - Math.PI / 2;
            return (
              <div
                key={i}
                className="circle-seat lobby-seat"
                style={{
                  left: `${50 + 37 * Math.cos(angle)}%`,
                  top: `${50 + 36 * Math.sin(angle)}%`,
                }}
              >
                {p ? (
                  <>
                    <PlayerAvatar avatar={p.avatar} id={p.id} dead={!p.alive} />
                    <strong>
                      {p.name}
                      {p.id === game.me ? ' · you' : ''}
                    </strong>
                  </>
                ) : (
                  <>
                    <div className="open-seat">
                      <button
                        disabled={
                          busy ||
                          game.host ||
                          !!me?.seat ||
                          game.phase !== 'lobby'
                        }
                        aria-label={`Claim seat ${i + 1}`}
                        onClick={() => void act('claimSeat', i + 1)}
                      >
                        Claim
                      </button>
                    </div>
                    <small>Seat {i + 1}</small>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </SeatChartZoom>
      {game.players.some((p) => !p.seat) && (
        <p className="muted">
          Choosing a seat:{' '}
          {game.players
            .filter((p) => !p.seat)
            .map((p) => p.name)
            .join(', ')}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
