'use client';
import { useState } from 'react';
import { DeathEffect } from './death-effect';
import { PlayerAvatar } from './player-avatar';
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
        <div className="death-announcement" key={announcement?.id}>
          {announcement?.names.map((name, i) => {
            const player = game.players.find(
              (p) => p.id === announcement.playerIds?.[i],
            );
            return (
              <div
                className="farewell-player"
                key={announcement.playerIds?.[i] ?? i}
              >
                <div className="cosmetic-preview-stage">
                  <PlayerAvatar
                    avatar={player?.avatar}
                    id={player?.id ?? name}
                    dead
                  />
                  <DeathEffect effect={player?.deathEffect} />
                </div>
                <h2>{name}</h2>
              </div>
            );
          })}
        </div>
        <p>Died during the night.</p>
        <button className="primary full" onClick={dismiss}>
          Continue to the town
        </button>
      </DialogContent>
    </Dialog>
  );
}
