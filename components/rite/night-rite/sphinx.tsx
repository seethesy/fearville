'use client';
import { useState } from 'react';
import type { RitePuzzleView } from '@/lib/rite/view';
import { type Triple } from '@/lib/rite/types';
import {
  CHARACTERS,
  LOCATIONS,
  ACTIVITIES,
  validTriples,
} from '@/lib/rite/grid';
import { PlaceArt, CharacterArt, ActivityArt } from '../art';
import { type Send } from './shell.tsx';
export function Sphinx({
  puzzle,
  send,
  busy,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
}) {
  const placements: Triple[] = puzzle.placements?.length
    ? puzzle.placements
    : Array.from({ length: 5 }, (_, location) => ({
        location,
        character: -1,
        activity: -1,
      }));
  const [token, setToken] = useState<{
    kind: 'character' | 'activity';
    id: number;
  } | null>(null);
  const editable = ['day', 'turn'].includes(puzzle.phase) && !busy;
  const place = (
    location: number,
    kind: 'character' | 'activity',
    id: number,
  ) => {
    if (!editable) return;
    void send('riteNotes', {
      placements: placements.map((p) =>
        p.location === location
          ? { ...p, [kind]: p[kind] === id ? -1 : id }
          : p[kind] === id
            ? { ...p, [kind]: -1 }
            : p,
      ),
    });
    setToken(null);
  };
  const colors = ['#d9c5f1', '#f9d6d6', '#d4e4fb', '#fbf0c2', '#dde0e3'];
  return (
    <div className="sphinx-puzzle">
      <div
        className="town-map"
        aria-label="The street. Places run west to east."
      >
        {LOCATIONS.map((name, location) => {
          const row = placements.find((p) => p.location === location)!;
          return (
            <div key={name} className={`town-place place-${location}`}>
              <PlaceArt place={location} />
              <strong>{name}</strong>
              <div className="town-spots">
                <button
                  aria-label={`${name}: ${row.character < 0 ? 'choose character' : CHARACTERS[row.character]}`}
                  disabled={!editable}
                  className="character-token"
                  style={{
                    background:
                      row.character < 0 ? 'transparent' : colors[row.character],
                  }}
                  onClick={() =>
                    token
                      ? place(location, token.kind, token.id)
                      : place(location, 'character', row.character)
                  }
                >
                  {row.character < 0 ? (
                    ''
                  ) : (
                    <CharacterArt character={row.character} />
                  )}
                </button>
                <button
                  className="activity-spot"
                  aria-label={`${name}: ${row.activity < 0 ? 'choose activity' : ACTIVITIES[row.activity]}`}
                  disabled={!editable}
                  onClick={() =>
                    token
                      ? place(location, token.kind, token.id)
                      : place(location, 'activity', row.activity)
                  }
                >
                  {row.activity < 0 ? (
                    ''
                  ) : (
                    <ActivityArt activity={row.activity} />
                  )}
                </button>
              </div>
            </div>
          );
        })}
        <div className="town-street" aria-hidden="true">
          <span>← West</span>
          <span>The street</span>
          <span>East →</span>
        </div>
      </div>
      <p className="hint">
        Select a token, then tap a place. Tap a filled spot to clear it.
      </p>
      <div className="rite-tray character-tray" aria-label="Characters">
        {CHARACTERS.map((c, id) => {
          const placed = placements.find((p) => p.character === id);
          return (
            <div className="character-tray-card" key={c}>
              <button
                aria-pressed={token?.kind === 'character' && token.id === id}
                disabled={!editable}
                className={placed ? 'used' : ''}
                onClick={() => setToken({ kind: 'character', id })}
              >
                <span
                  className="character-token"
                  style={{ background: colors[id] }}
                >
                  <CharacterArt character={id} />
                </span>
                <small>{c}</small>
              </button>
              <button
                className="activity-spot"
                aria-label={`${c}: ${placed?.activity === undefined || placed.activity < 0 ? 'empty activity slot' : ACTIVITIES[placed.activity]}`}
                disabled={
                  !editable ||
                  !placed ||
                  (token?.kind !== 'activity' && placed.activity < 0)
                }
                onClick={() => {
                  if (placed)
                    place(
                      placed.location,
                      'activity',
                      token?.kind === 'activity' ? token.id : placed.activity,
                    );
                }}
              >
                {placed && placed.activity >= 0 && (
                  <ActivityArt activity={placed.activity} />
                )}
              </button>
            </div>
          );
        })}
      </div>
      <div className="rite-tray" aria-label="Activities">
        {ACTIVITIES.map((a, id) => (
          <button
            key={a}
            aria-pressed={token?.kind === 'activity' && token.id === id}
            disabled={!editable}
            className={placements.some((p) => p.activity === id) ? 'used' : ''}
            onClick={() => setToken({ kind: 'activity', id })}
          >
            <span className="activity-token">
              <ActivityArt activity={id} />
            </span>
            <small>{a}</small>
          </button>
        ))}
      </div>
      <div className="rite-buttons">
        <button
          className="primary"
          disabled={
            busy || puzzle.phase !== 'turn' || !validTriples(placements)
          }
          onClick={() => void send('riteGridSubmit', { solution: placements })}
        >
          Submit for tonight
        </button>
      </div>
      {puzzle.submission?.length === 5 && (
        <p className="rite-notice">
          Your submission was recorded. You may replace it while the window is
          open.
        </p>
      )}
      <div className="rite-clues">
        <h3>Your clues</h3>
        {puzzle.clues
          ?.filter((c) => !c.forged)
          .map((c, i) => (
            <div className="rite-clue" key={c.id}>
              <b>{i + 1}</b>
              {c.hidden ? (
                <span className="hidden-clue">
                  🔒 Revealed night {c.revealNight}
                </span>
              ) : (
                <span>{c.text}</span>
              )}
            </div>
          ))}
        {puzzle.clues?.some((c) => c.forged) && (
          <div className="forged-clues">
            <h3>Extra clues · Evil only</h3>
            {puzzle.clues
              .filter((c) => c.forged)
              .map((c) => (
                <div key={c.id}>
                  <b>FORGED</b> {c.text}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
