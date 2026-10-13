'use client';
import { useTableActions } from '@/hooks/use-table-actions';
import { useState } from 'react';
import type { GameView } from '@/lib/game/view';

export function RankedMode({
  game,
  refresh,
}: {
  game: GameView;
  refresh: () => Promise<void>;
}) {
  const actionFetch = useTableActions();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function choose(ranked: boolean) {
    setBusy(true);
    setError('');
    try {
      const r = await actionFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setRanked',
          ranked,
          version: game.version,
        }),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(result.error ?? 'Unable to change game mode.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change game mode.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel ranked-mode" aria-label="Game mode">
      <div>
        <strong>{game.ranked ? 'Ranked game' : 'Casual game'}</strong>
        <p className="hint">
          {game.ranked
            ? 'Everyone must save their seat to a different account. Your Elo change is fixed when the game begins.'
            : game.sandbox
              ? 'Practice games do not earn XP or change Elo.'
              : 'Earn XP and build your record. Elo changes only in ranked games.'}
        </p>
      </div>
      {game.host && game.phase === 'lobby' && !game.sandbox && (
        <div className="actions">
          <button
            className="secondary"
            aria-pressed={!game.ranked}
            disabled={busy || !game.ranked}
            onClick={() => void choose(false)}
          >
            Casual
          </button>
          <button
            className="secondary"
            aria-pressed={game.ranked}
            disabled={busy || game.ranked}
            onClick={() => void choose(true)}
          >
            Ranked
          </button>
        </div>
      )}
      {game.ratingPreview && (
        <p className="rating-preview">
          Your Elo: <strong>{game.ratingPreview.rating}</strong> · Win{' '}
          <strong>+{game.ratingPreview.win}</strong> · Loss{' '}
          <strong>{game.ratingPreview.loss}</strong>
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
