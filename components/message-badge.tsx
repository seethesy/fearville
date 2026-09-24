'use client';
import type { GameView } from '@/lib/game/view';
import { useMessagePreferences } from './message-preferences';
export function MessageBadge({ game }: { game: GameView }) {
  const { prefs } = useMessagePreferences(game.code, game.me);
  const count = game.messages.filter(
    (m) => m.from !== game.me && !prefs.read.includes(m.id),
  ).length;
  return count ? (
    <span className="message-badge" aria-label={`${count} unread messages`}>
      {count}
    </span>
  ) : null;
}
