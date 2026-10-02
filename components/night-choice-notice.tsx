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
  const c = pending.choice;
  const picked = [c.target, c.target2, c.target3 ?? '']
    .filter(Boolean)
    .map(name);
  const list =
    picked.length > 1
      ? picked.slice(0, -1).join(', ') + ' and ' + picked.at(-1)
      : (picked[0] ?? '');
  const summary = c.pass
    ? 'passed'
    : [
        list && 'selected ' + list,
        c.text && `asked “${c.text}”`,
        c.guesses?.length &&
          `made ${c.guesses.length} guess${c.guesses.length === 1 ? '' : 'es'}`,
      ]
        .filter(Boolean)
        .join(' and ') || 'sent a choice';
  return (
    <output className="night-choice-notice">
      <strong>
        {pending.playerName} {summary}.
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
