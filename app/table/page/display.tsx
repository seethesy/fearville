'use client';
import type { GameView } from '@/lib/game/view';
import type { Control } from '@/lib/game/types';
import { type TableState } from './state.tsx';
export function tableDisplay(state: TableState & { game: GameView }) {
  const { game, now, offset, open, socket, busy, activeTab } = state;

  const nightWindowActive =
    game.nightChoiceDeadline !== null &&
    game.nightChoiceDeadline > now + offset;

  const displayDeadline = nightWindowActive
    ? game.nightChoiceDeadline
    : game.deadline;

  const seconds = Math.max(
    0,
    Math.ceil(
      displayDeadline
        ? (displayDeadline - now - offset) / 1000
        : game.remaining,
    ),
  );

  const clock = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  const name = (id: string) =>
    game.players.find((p) => p.id === id)?.name || 'Storyteller';

  const first = game.tasks.find((t) => !t.done);

  const core = game.controls.filter(
    (c) =>
      ![
        'chat',
        'claimSeat',
        'leaveSeat',
        'edit',
        'configure',
        'undo',
        'rewind',
        'end',
        'overridePhase',
        'pause',
        'resume',
        'extend',
      ].includes(c.action),
  );

  const pendingDeath = game.controls.find((c) => c.action === 'resolveDeath');

  const button = (c: Control, primary = false) => (
    <button
      key={c.action + c.title}
      className={primary ? 'primary' : c.danger ? 'danger' : 'secondary'}
      onClick={() => open(c)}
      disabled={
        !socket.connected ||
        busy ||
        (nightWindowActive && ['night', 'nightSkip', 'dawn'].includes(c.action))
      }
    >
      {c.title}
    </button>
  );

  const tab =
    game.phase === 'lobby' &&
    !game.host &&
    !['flow', 'cosmetic', 'recap', 'script'].includes(activeTab)
      ? 'flow'
      : game.phase !== 'lobby' &&
          !game.host &&
          ['cosmetic', 'recap'].includes(activeTab)
        ? 'flow'
        : activeTab;

  // Night Rite guides: a player sees only their own vigil's pattern; the
  // Storyteller, who chooses the patterns, sees every enabled one.
  const rite = game.rite;

  const ownGuide =
    rite && !rite.host && rite.squad ? `guide.${rite.squad.kind}` : null;

  const riteGuides = !rite
    ? []
    : rite.host
      ? rite.enabled
        ? rite.config.patterns
        : []
      : rite.squad
        ? [rite.squad.kind]
        : [];
  return {
    ...state,
    nightWindowActive,
    displayDeadline,
    seconds,
    clock,
    name,
    first,
    core,
    pendingDeath,
    button,
    tab,
    rite,
    ownGuide,
    riteGuides,
  };
}
export type TableContext = ReturnType<typeof tableDisplay>;
