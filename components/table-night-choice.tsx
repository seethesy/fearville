'use client';
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { ROLES } from '@/lib/game/types';
import type { GameView } from '@/lib/game/view';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function TableNightChoice({
  prompt,
  refresh,
  game,
  now,
}: {
  game: GameView;
  now: number;
  prompt: NonNullable<GameView['nightChoice']>;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(!prompt.choice);
  const [guesses, setGuesses] = useState<
    Record<string, { role: string; confidence: string }>
  >({});
  const seconds =
    prompt.deadline === null
      ? null
      : Math.max(0, Math.ceil((prompt.deadline - now) / 1000));
  const expired = seconds === 0;
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(
          localStorage.getItem(`fearville-notes:${game.code}:${game.me}`) ??
            '{}',
        );
        setGuesses(saved.players ?? {});
      } catch {
        setGuesses({});
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, game.code, game.me]);
  const [picked, setPicked] = useState<string[]>(() =>
    [prompt.choice?.target, prompt.choice?.target2].filter(
      (s): s is string => !!s,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(ids: string[]) {
    if (expired) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'nightChoice',
          task: prompt.task,
          round: prompt.round,
          target: ids[0],
          target2: ids[1],
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to send. Try again.');
      await refresh();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const sent =
    !!prompt.choice &&
    picked[0] === prompt.choice.target &&
    (picked[1] ?? '') === prompt.choice.target2;
  if (expired) return null;
  return (
    <section className="panel night-choice-panel">
      <h2>Your night choice</h2>
      <p>
        {prompt.choice
          ? 'Choice sent. The Storyteller will confirm your action.'
          : `Choose ${prompt.count === 2 ? 'two different players' : 'a player'}.`}
      </p>
      <button className="primary" onClick={() => setOpen(true)}>
        {prompt.choice ? 'View or change choice' : 'Choose a player'}
      </button>
      <Dialog open={open && !expired} onOpenChange={setOpen}>
        <DialogContent className="action-dialog">
          <DialogHeader>
            <DialogTitle>Your night choice</DialogTitle>
            <DialogDescription>
              Tap {prompt.count === 2 ? 'two different players' : 'a player'}.
              Your choice is sent privately to the Storyteller, who confirms the
              action.
            </DialogDescription>
          </DialogHeader>
          {seconds !== null && (
            <p
              className={seconds <= 20 ? 'countdown timer-urgent' : 'countdown'}
              role="timer"
              aria-label="Night choice time remaining"
            >
              {seconds}s remaining
            </p>
          )}
          {prompt.conditional && (
            <p>This choice is used only if your ability activates tonight.</p>
          )}
          <div className="night-player-choices">
            {prompt.options.map((p) => (
              <button
                key={p.id}
                className={picked.includes(p.id) ? 'primary' : 'secondary'}
                aria-pressed={picked.includes(p.id)}
                disabled={busy || !p.eligible}
                onClick={() => {
                  const next =
                    prompt.count === 1
                      ? [p.id]
                      : picked.includes(p.id)
                        ? picked.filter((id) => id !== p.id)
                        : picked.length < 2
                          ? [...picked, p.id]
                          : [p.id];
                  setPicked(next);
                  setError('');
                }}
              >
                <span>
                  {p.seat}. {p.name}
                  {!p.eligible ? ' (cannot choose yourself)' : ''}
                </span>
                {(p.knownRole || guesses[p.id]?.role) && (
                  <small
                    className={
                      p.knownRole || guesses[p.id]?.confidence === 'confirmed'
                        ? 'guess-confirmed'
                        : guesses[p.id]?.confidence === 'suspected'
                          ? 'guess-suspected'
                          : ''
                    }
                  >
                    {p.knownRole ??
                      ROLES.find((r) => r.id === guesses[p.id]?.role)
                        ?.name}{' '}
                    ·{' '}
                    {p.knownRole
                      ? 'Known Haunt'
                      : guesses[p.id]?.confidence === 'confirmed'
                        ? 'Confirmed'
                        : guesses[p.id]?.confidence === 'suspected'
                          ? 'Suspected'
                          : 'Unmarked'}
                  </small>
                )}
              </button>
            ))}
          </div>
          <output>
            {busy
              ? 'Sending…'
              : sent
                ? 'Sent. Waiting for Storyteller confirmation.'
                : picked.length === prompt.count
                  ? 'Ready. Confirm your choice below.'
                  : `Select ${prompt.count - picked.length} more player${prompt.count - picked.length === 1 ? '' : 's'}.`}
          </output>
          {error && (
            <>
              <p className="error" role="alert">
                {error}
              </p>
              <button
                className="secondary"
                disabled={busy || picked.length !== prompt.count}
                onClick={() => void send(picked)}
              >
                Retry sending
              </button>
            </>
          )}
          <div className="vote-choices">
            <button
              type="button"
              className="vote-choice vote-true"
              disabled={busy || picked.length !== prompt.count}
              onClick={() => void send(picked)}
            >
              <Check aria-hidden="true" />
              Confirm
            </button>
            <button
              type="button"
              className="vote-choice vote-false"
              disabled={busy}
              onClick={() => {
                setPicked(
                  [prompt.choice?.target, prompt.choice?.target2].filter(
                    (id): id is string => !!id,
                  ),
                );
                setOpen(false);
              }}
            >
              <X aria-hidden="true" />
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
