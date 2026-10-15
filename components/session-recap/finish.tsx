'use client';
import { useEffect, useState } from 'react';
import { Crown } from 'lucide-react';
import type { GameView } from '@/lib/game/view';
import { PlayerAvatar } from '../player-avatar';
import { TutorialHold } from '../tutorials/provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { gameDuration, roleColor } from './shared.tsx';
import { InlineFeedback } from '../feedback/inline';
export function GameEndPopup({
  game,
  refresh,
  onReturn,
}: {
  game: GameView;
  refresh: () => Promise<void>;
  onReturn: () => void;
}) {
  const recap = game.recaps.at(-1);
  const key = recap ? `fearville-recap-dismissed:${recap.id}:${game.me}` : '';
  const [dismissed, setDismissed] = useState('');
  const [ready, setReady] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem(key)) setDismissed(key);
      } catch {
        /* In-memory dismissal still works. */
      }
      setReady(key);
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  if (!recap || (!game.host && !recap.players.some((p) => p.id === game.me)))
    return null;
  const open =
    ready === key &&
    dismissed !== key &&
    ['ended', 'lobby'].includes(game.phase);
  const limit = game.host ? 3 : 1;
  function dismiss() {
    setDismissed(key);
    try {
      sessionStorage.setItem(key, 'yes');
    } catch {
      /* Optional persistence. */
    }
  }
  async function act(
    action: 'mvpVote' | 'returnLobby' | 'leaveLobby',
    player?: string,
  ) {
    setBusy(true);
    setError('');
    try {
      const leaving = action === 'leaveLobby';
      const response = await fetch(leaving ? '/api/session' : '/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: leaving && game.host ? 'leave' : action,
          player,
          recap: recap!.id,
          version: game.version,
          ...(game.sandboxHost && !game.host ? { pov: game.me } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error || 'Unable to save. Try again.');
      if (leaving) {
        dismiss();
        location.assign('/');
        return;
      }
      if (action === 'returnLobby') {
        dismiss();
        onReturn();
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="action-dialog mvp-dialog"
        showCloseButton={false}
      >
        {/* Mounted only while open: holds tutorial popups. */}
        <TutorialHold name="game-end" active />
        <DialogHeader>
          <div className="recap-heading">
            <DialogTitle>{recap.winner} wins</DialogTitle>
            <span aria-label="Game duration">{gameDuration(recap)}</span>
          </div>
          <DialogDescription>
            Choose your MVP{game.host ? 's' : ''}.{' '}
            {limit - recap.myVotes.length} of {limit} votes remaining.{' '}
            {game.host
              ? 'Choose three different players.'
              : 'You cannot vote for yourself.'}{' '}
            Votes are final.
          </DialogDescription>
          {recap.myReward && (
            <p className="recap-rewards">
              <strong>
                {recap.myReward.xp.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{' '}
                XP
              </strong>
              {' · '}
              {recap.myReward.baseXp} from playing
              {recap.myReward.mvpXp > 0
                ? ` + ${recap.myReward.mvpXp.toLocaleString(undefined, { maximumFractionDigits: 2 })} MVP bonus`
                : ''}
              {recap.myReward.eloDelta !== null && (
                <>
                  {' '}
                  · Elo{' '}
                  <strong>
                    {recap.myReward.eloDelta >= 0 ? '+' : ''}
                    {recap.myReward.eloDelta}
                  </strong>
                </>
              )}
              <small className="hint">
                MVP bonus updates as votes arrive.
                {!recap.myReward.saved &&
                  ' Save this seat to your account to keep your XP.'}
              </small>
            </p>
          )}
        </DialogHeader>
        <div className="mvp-list" aria-label="MVP candidates">
          {recap.players.map((p) => (
            <button
              key={p.id}
              className="mvp-candidate"
              disabled={
                busy ||
                recap.myVotes.length >= limit ||
                recap.myVotes.includes(p.id) ||
                (!game.host && p.id === game.me)
              }
              onClick={() => void act('mvpVote', p.id)}
              aria-pressed={recap.myVotes.includes(p.id)}
            >
              <PlayerAvatar avatar={p.avatar} id={p.id} />
              <span className="mvp-identity">
                <strong>
                  {p.name}
                  {p.id === game.me ? ' · you' : ''}
                </strong>
                <small style={{ color: roleColor(p) }}>
                  {p.role || 'Unassigned'}
                </small>
              </span>
              <span className="mvp-status">
                {recap.myVotes.includes(p.id) && (
                  <Crown size={17} aria-label="Your MVP vote" />
                )}
                {p.alive === false ? 'Dead' : 'Alive'}
              </span>
            </button>
          ))}
        </div>
        {/* FEAR-174: players rate the script; the Storyteller gets their
            own form. The dialog itself holds tutorials, so ignore blockers. */}
        <InlineFeedback
          context={game.host ? 'storyteller' : 'script'}
          subject={game.script}
          occasion={`recap:${recap.id}`}
          respectBlockers={false}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="mvp-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act('leaveLobby')}
          >
            {game.host ? 'Return home' : 'Leave lobby'}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void act('returnLobby')}
          >
            Return to Lobby
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
