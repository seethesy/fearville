'use client';
import { useEffect, useState } from 'react';
import { ChevronRight, Crown } from 'lucide-react';
import type { GameView } from '@/lib/game/view';
import { SCRIPTS } from '@/lib/game/types';
import { PlayerAvatar } from '../player-avatar';
import { SeatChartZoom } from '../seat-chart-zoom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { type Recap, roleColor, gameDuration } from './shared.tsx';
import { PlayerDetails } from './details.tsx';
export function SessionRecaps({
  game,
  expanded = false,
}: {
  game: Pick<GameView, 'recaps' | 'me' | 'host'> & { code?: string };
  expanded?: boolean;
}) {
  const [selected, setSelected] = useState<{
    recap: string;
    player: string;
  } | null>(null);
  const summary = game.recaps.find((r) => r.id === selected?.recap);
  const selectionKey = `${selected?.recap}:${selected?.player}:${summary?.detailsRevision}`;
  const [loaded, setLoaded] = useState<{ key: string; recap: Recap } | null>(
    null,
  );
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!summary?.detailsDeferred || !selected) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ id: summary.id, pov: game.me });
    void fetch('/api/table/recap?' + params, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          recap: Recap;
          error?: string;
        };
        if (!response.ok)
          throw Error(data.error || 'Could not load this recap.');
        if (!controller.signal.aborted)
          setLoaded({ key: selectionKey, recap: data.recap });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Could not load this recap.',
          );
      });
    return () => controller.abort();
  }, [
    summary?.detailsDeferred,
    summary?.id,
    selected,
    selectionKey,
    game.me,
    attempt,
  ]);
  const recap = loaded?.key === selectionKey ? loaded.recap : summary;
  const player = recap?.players.find((p) => p.id === selected?.player);
  return (
    <section className="session-recaps">
      {!game.recaps.length && (
        <div className="panel">
          <h2>Session Recap</h2>
          <p>Your completed games will appear here.</p>
        </div>
      )}
      {game.recaps.map((r, index) => {
        const mine = r.players.find((p) => p.id === game.me);
        return (
          <details
            className="panel session-recap"
            key={r.id}
            open={expanded || undefined}
          >
            <summary>
              <ChevronRight className="recap-arrow" size={20} />
              <strong>Session {r.number ?? index + 1}</strong>
              <span style={{ color: mine ? roleColor(mine) : undefined }}>
                {game.host
                  ? 'Storyteller'
                  : (mine?.role ?? 'Not in this session')}
              </span>
            </summary>
            <div className="recap-heading">
              <h3>{r.winner} wins</h3>
              <span>{gameDuration(r)}</span>
            </div>
            <p className="muted">{SCRIPTS[r.script]}</p>
            <SeatChartZoom
              width={Math.max(520, r.players.length * 57)}
              height={Math.max(520, r.players.length * 57)}
            >
              <div
                className="seat-circle recap-circle"
                style={{
                  width: Math.max(520, r.players.length * 57),
                  height: Math.max(520, r.players.length * 57),
                  minWidth: Math.max(520, r.players.length * 57),
                }}
              >
                <div className="circle-center">
                  Session {r.number ?? index + 1}
                  <br />
                  <small>Click a player to explore</small>
                </div>
                {r.players.map((p, i) => {
                  const angle =
                    (2 * Math.PI * i) / r.players.length - Math.PI / 2;
                  return (
                    <button
                      key={p.id}
                      className="circle-seat recap-seat"
                      style={{
                        left: `${50 + 37 * Math.cos(angle)}%`,
                        top: `${50 + 36 * Math.sin(angle)}%`,
                      }}
                      onClick={() => {
                        setLoaded(null);
                        setLoadError('');
                        setSelected({ recap: r.id, player: p.id });
                      }}
                      aria-label={`View ${p.name}'s session recap`}
                    >
                      <small
                        className="recap-role"
                        style={{ color: roleColor(p) }}
                      >
                        {p.role || 'Unassigned'}
                      </small>
                      <PlayerAvatar
                        avatar={p.avatar}
                        id={p.id}
                        dead={p.alive === false}
                      />
                      <span className="recap-player-name">
                        {p.name}
                        <span
                          className="mvp-count"
                          aria-label={`${r.mvpCounts[p.id] ?? 0} MVP votes`}
                        >
                          <Crown size={15} />
                          {r.mvpCounts[p.id] ?? 0}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </SeatChartZoom>
          </details>
        );
      })}
      <Dialog
        open={!!player}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="action-dialog recap-player-dialog">
          <DialogHeader>
            <DialogTitle>{player?.name}</DialogTitle>
            <DialogDescription>
              {player?.role} · Session{' '}
              {recap?.number ?? (recap ? game.recaps.indexOf(recap) + 1 : '')}
            </DialogDescription>
          </DialogHeader>
          {recap &&
            player &&
            (recap.detailsDeferred ? (
              <div>
                <p role={loadError ? 'alert' : 'status'}>
                  {loadError || 'Loading session details…'}
                </p>
                {loadError && (
                  <button
                    className="secondary"
                    onClick={() => setAttempt((old) => old + 1)}
                  >
                    Try again
                  </button>
                )}
              </div>
            ) : (
              <PlayerDetails
                key={recap.id + player.id}
                recap={recap}
                player={player}
              />
            ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}
