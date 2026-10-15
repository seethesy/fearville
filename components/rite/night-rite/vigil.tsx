'use client';
import type { GameView } from '@/lib/game/view';
import { PATTERNS, type Squad } from '@/lib/rite/types';
import { CHARACTERS, LOCATIONS, ACTIVITIES } from '@/lib/rite/grid';
import { controlLabel } from '@/lib/rite/ritual';
import { type Send } from './shell.tsx';
import { Escape } from './escape.tsx';
import { Laboratory } from './laboratory.tsx';
export function HostVigil({
  squad: s,
  game,
  send,
  busy,
}: {
  squad: Squad;
  game: GameView;
  send: Send;
  busy: boolean;
}) {
  const state = s.state,
    turn = state.type === 'board' || state.type === 'lab' ? state.turn : null;
  return (
    <details className="host-vigil">
      <summary>
        {PATTERNS[s.kind]} ·{' '}
        {s.members
          .map((id) => game.players.find((p) => p.id === id)?.name)
          .join(', ')}{' '}
        · {s.completeNight ? 'Complete' : 'In progress'}
      </summary>
      {(state.type === 'board' || state.type === 'lab') && (
        <>
          <p>
            Par: {state.par} · Distance: {state.distance ?? 'Not yet certified'}{' '}
            · Current turn:{' '}
            {turn?.order.length && !state.solved
              ? game.players.find(
                  (p) => p.id === turn.order[turn.cursor % turn.order.length],
                )?.name
              : 'Finished'}
          </p>
          {state.type === 'board' ? (
            <Escape
              puzzle={{ type: 'board', phase: 'day', blocks: state.blocks }}
              send={async () => {}}
              busy={true}
            />
          ) : (
            <Laboratory
              puzzle={{ type: 'lab', phase: 'day', vials: state.vials }}
              send={async () => {}}
              busy={true}
            />
          )}
          <ol>
            {turn?.log.map((l, i) => (
              <li key={i}>
                {game.players.find((p) => p.id === l.player)?.name}: {l.kind}{' '}
                {l.detail}
              </li>
            ))}
          </ol>
        </>
      )}
      {state.type === 'grid' && (
        <>
          <p>
            Solution:{' '}
            {state.solution
              .map(
                (t) =>
                  `${CHARACTERS[t.character]} / ${LOCATIONS[t.location]} / ${ACTIVITIES[t.activity]}`,
              )
              .join('; ')}
          </p>
          {state.clues.map((c) => (
            <p key={c.id}>
              {game.players.find((p) => p.id === c.holder)?.name}: {c.text}{' '}
              {c.forged ? '[Forged]' : ''} · Night {c.revealNight}
            </p>
          ))}
        </>
      )}
      {state.type === 'ritual' &&
        Object.values(state.rituals).map((r) => (
          <p key={r.performer}>
            {game.players.find((p) => p.id === r.performer)?.name}:{' '}
            {r.target
              .map((t) => `${t.control}: ${controlLabel(t.control, t.value)}`)
              .join('; ')}{' '}
            · {r.doneNight ? 'Performed' : 'Pending'}
          </p>
        ))}
      {turn &&
        (state.type === 'board' || state.type === 'lab') &&
        !state.solved &&
        game.phase === 'night' &&
        game.rite?.status === 'open' &&
        !game.rite.windowEnd && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void send('ritePassTurn', { squad: s.id })}
          >
            Pass current turn
          </button>
        )}
      <button
        className="secondary"
        disabled={busy || game.rite?.status === 'complete'}
        onClick={() => void send('riteRedeal', { squad: s.id })}
      >
        Redeal this vigil’s puzzle
      </button>
    </details>
  );
}
