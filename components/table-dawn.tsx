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

export function TableDawn({ game }: { game: GameView }) {
  const announcement = game.dawnAnnouncement;
  const key = `fearville-dawn:${game.code}:${game.me}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window === 'undefined'
        ? ''
        : (localStorage.getItem(key) ?? '');
    } catch {
      return '';
    }
  });
  const dismiss = () => {
    if (!announcement) return;
    setDismissed(announcement.id);
    try {
      localStorage.setItem(key, announcement.id);
    } catch {
      /* Memory fallback. */
    }
  };
  return (
    <Dialog
      open={!!announcement?.names.length && dismissed !== announcement.id}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent className="action-dialog">
        <DialogHeader>
          <DialogTitle>Dawn · Night {announcement?.night}</DialogTitle>
          <DialogDescription>
            The town wakes to discover who died during the night.
          </DialogDescription>
        </DialogHeader>
        {announcement?.names.map((name, i) => (
          <h2 key={i}>{name}</h2>
        ))}
        <p>Died during the night.</p>
        <button className="primary full" onClick={dismiss}>
          Continue to the town
        </button>
      </DialogContent>
    </Dialog>
  );
}
