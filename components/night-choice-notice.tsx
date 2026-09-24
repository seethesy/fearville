'use client';
import { useState } from 'react';
import type { GameView } from '@/lib/game/view';
export function NightChoiceNotice({
  game,
  onReview,
}: {
  game: GameView;
  onReview: () => void;
}) {
  const [dismissed, setDismissed] = useState('');
  const pending = game.nightConfirmation;
  if (!pending?.choice || dismissed === pending.choice.id) return null;
  const name = (id: string) =>
    game.players.find((p) => p.id === id)?.name ?? 'a player';
  return (
    <output className="night-choice-notice">
      <strong>
        {pending.playerName} selected {name(pending.choice.target)}
        {pending.choice.target2 ? ` and ${name(pending.choice.target2)}` : ''}.
      </strong>
      <span>Ready for your confirmation.</span>
      <button className="primary" onClick={onReview}>
        Review choice
      </button>
      <button
        className="secondary"
        aria-label="Dismiss target notification"
        onClick={() => setDismissed(pending.choice!.id)}
      >
        Dismiss
      </button>
    </output>
  );
}
