'use client';
import { useState } from 'react';
import type { RitePuzzleView } from '@/lib/rite/view';
import { VialArt } from '../art';
import { type Send } from './shell.tsx';
export function Laboratory({
  puzzle,
  send,
  busy,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
}) {
  const [from, setFrom] = useState(''),
    [sheet, setSheet] = useState(false),
    active = puzzle.phase === 'turn' && !busy;
  const call = (kind: string) => {
    setSheet(false);
    void send('riteLabCall', { kind, turn: puzzle.turn });
  };
  return (
    <div className="lab-puzzle">
      <div className="lab-shelves">
        {puzzle.vials?.map((v) => (
          <button
            className={'vial ' + (from === v.id ? 'selected' : '')}
            key={v.id}
            aria-pressed={from === v.id}
            disabled={!active}
            onClick={() => {
              if (from && from !== v.id) {
                void send('riteLabPour', { from, to: v.id, turn: puzzle.turn });
                setFrom('');
              } else setFrom(from === v.id ? '' : v.id);
            }}
          >
            <VialArt vial={v} selected={from === v.id} />
          </button>
        ))}
      </div>
      <p className="hint">
        Tap a vial, then tap where to pour it. Match color and substance. Each
        vial holds four units.
      </p>
      {active && (
        <div className="rite-buttons">
          <button className="secondary" onClick={() => setSheet(true)}>
            Undo / Reset
          </button>
          <button
            className="secondary"
            onClick={() => void send('ritePass', { turn: puzzle.turn })}
          >
            Pass
          </button>
        </div>
      )}
      {sheet && (
        <dialog open className="rite-vote-sheet" aria-label="Call a vote">
          <h3>Call a vote</h3>
          <button
            className="secondary"
            disabled={!puzzle.canUndo}
            onClick={() => call('undo')}
          >
            Undo the last pour tonight
          </button>
          <button className="secondary" onClick={() => call('reset')}>
            Reset the original puzzle
          </button>
          <p>Everyone else must agree. Calling a vote uses your turn.</p>
          <button className="secondary" onClick={() => setSheet(false)}>
            Never mind
          </button>
        </dialog>
      )}
      {puzzle.vote && (
        <div className="rite-vote-sheet" aria-live="polite">
          <h3>A vote has been called</h3>
          <p>
            {puzzle.vote.kind === 'undo'
              ? 'Undo tonight’s last pour?'
              : 'Reset to the original puzzle?'}
          </p>
          <p>
            Everyone else must agree. Votes are anonymous and stay open until
            everyone answers or the Rite closes.
          </p>
          {puzzle.vote.canVote && !puzzle.vote.answered && (
            <div className="rite-buttons">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void send('riteLabBallot', {
                    vote: puzzle.vote!.id,
                    yes: true,
                  })
                }
              >
                Yes
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void send('riteLabBallot', {
                    vote: puzzle.vote!.id,
                    yes: false,
                  })
                }
              >
                No
              </button>
            </div>
          )}
        </div>
      )}
      {puzzle.voteResult && (
        <p className="rite-notice">
          The vote {puzzle.voteResult.passed ? 'passed' : 'failed'}.
        </p>
      )}
      {puzzle.ruined && (
        <p className="rite-error">
          The brew is ruined. The laboratory resets to the start of tonight.
        </p>
      )}
    </div>
  );
}
