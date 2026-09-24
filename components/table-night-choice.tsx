'use client';
import { useState } from 'react';
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
}: {
  prompt: NonNullable<GameView['nightChoice']>;
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(!prompt.choice);
  const [picked, setPicked] = useState<string[]>(() =>
    [prompt.choice?.target, prompt.choice?.target2].filter(
      (s): s is string => !!s,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(ids: string[]) {
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
  return (
    <section className="panel night-choice-panel">
      <h2>Your night choice</h2>
      <p>
        {prompt.choice
          ? 'Choice sent. The Storyteller will confirm your action.'
          : `It is your turn. Choose ${prompt.count === 2 ? 'two different players' : 'a player'}.`}
      </p>
      <button className="primary" onClick={() => setOpen(true)}>
        {prompt.choice ? 'View or change choice' : 'Choose a player'}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="action-dialog">
          <DialogHeader>
            <DialogTitle>Your night choice</DialogTitle>
            <DialogDescription>
              Tap {prompt.count === 2 ? 'two different players' : 'a player'}.
              Your choice is sent privately to the Storyteller, who confirms the
              action.
            </DialogDescription>
          </DialogHeader>
          <div className="night-player-choices">
            {prompt.options.map((p) => (
              <button
                key={p.id}
                className={picked.includes(p.id) ? 'primary' : 'secondary'}
                aria-pressed={picked.includes(p.id)}
                disabled={busy}
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
                  if (next.length === prompt.count) void send(next);
                }}
              >
                {p.seat}. {p.name}
              </button>
            ))}
          </div>
          <output>
            {busy
              ? 'Sending…'
              : sent
                ? 'Sent. Waiting for Storyteller confirmation.'
                : picked.length === prompt.count
                  ? 'Choice not sent yet.'
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
          <button className="secondary" onClick={() => setOpen(false)}>
            Back to table
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
