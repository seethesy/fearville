'use client';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { GameView } from '@/lib/game/view';

// The Sphinx's nightly glimpse of every player's role. It opens on its own
// and disappears when the night-choice timer ends; it is never stored in
// Messages.
export function SphinxGlimpse({
  glimpse,
  now,
}: {
  glimpse: NonNullable<GameView['glimpse']>;
  now: number;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setOpen(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  const seconds =
    glimpse.deadline === null
      ? null
      : Math.max(0, Math.ceil((glimpse.deadline - now) / 1000));
  if (seconds === 0) return null;
  return (
    <section className="panel night-choice-panel">
      <p className="eyebrow">NIGHT {glimpse.night} · SPHINX</p>
      <h2>Your glimpse</h2>
      <p>
        Every player’s role, visible until the night choice timer ends
        {seconds !== null ? ` (${seconds}s)` : ''}.
      </p>
      <button className="primary" onClick={() => setOpen(true)}>
        View glimpse
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="action-dialog">
          <DialogHeader>
            <DialogTitle>The Sphinx’s glimpse</DialogTitle>
            <DialogDescription>
              Keep this screen to yourself. It closes when the night choice
              timer ends.
            </DialogDescription>
          </DialogHeader>
          {seconds !== null && (
            <p
              className={seconds <= 20 ? 'countdown timer-urgent' : 'countdown'}
              role="timer"
              aria-label="Glimpse time remaining"
            >
              {seconds}s remaining
            </p>
          )}
          <ol className="sphinx-glimpse">
            {glimpse.entries.map((e) => (
              <li key={e.seat} className={e.alive ? '' : 'dead'}>
                <span>
                  {e.seat}. {e.name}
                  {e.alive ? '' : ' (dead)'}
                </span>
                <strong>{e.role}</strong>
              </li>
            ))}
          </ol>
          <button className="primary" onClick={() => setOpen(false)}>
            Hide
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
