'use client';
import { useEffect, useState } from 'react';
import { Check, CircleHelp } from 'lucide-react';
import { scriptRoles } from '@/lib/game/types';
import type { GameView } from '@/lib/game/view';
import { RoleIcon } from './role-icon';
type Notebook = {
  roles: Record<string, number>;
  players: Record<string, { role: string; confidence: string }>;
  text: string;
};
const empty = (): Notebook => ({ roles: {}, players: {}, text: '' });
const colors = ['red', 'yellow', 'green'];
const labels = ['Ruled out', 'Possible', 'In play'];
export function PlayerNotes({ game }: { game: GameView }) {
  const storageKey = `fearville-notes:${game.code}:${game.me}`;
  const [notes, setNotes] = useState<Notebook>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw);
          if (
            saved &&
            typeof saved.text === 'string' &&
            saved.roles &&
            saved.players
          )
            setNotes(saved);
        }
      } catch {
        setError('Saved notes could not be loaded on this device.');
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey]);
  function update(next: Notebook) {
    setNotes(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setError('');
    } catch {
      setError(
        'Notes cannot be saved on this device. Keep this page open to retain them.',
      );
    }
  }
  const roles = scriptRoles(game.script);
  return (
    <div className="player-notebook">
      <section className="panel">
        <h2>Your private notebook</h2>
        <p className="muted">
          Saved on this device for this seat. Your notes are not shared with the
          Storyteller or other players.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Roles in the game</h2>
        <p>
          Tap to cycle: red (ruled out), yellow (possible), green (in play). All
          roles start as possible.
        </p>
        {!roles.length && <p>Holy Moon and Stars roles are coming soon.</p>}
        {(
          [
            ['townsfolk', 'Villagers'],
            ['outsider', 'Fools'],
            ['minion', 'Haunts'],
            ['demon', 'Horrors'],
          ] as const
        ).map(
          ([team, label]) =>
            roles.some((r) => r.team === team) && (
              <section key={team}>
                <h3>{label}</h3>
                <div className="role-pick-grid">
                  {roles
                    .filter((r) => r.team === team)
                    .map((r) => {
                      const status = notes.roles[r.id] ?? 1;
                      return (
                        <button
                          type="button"
                          disabled={!ready}
                          key={r.id}
                          className={`role-pick note-role note-${colors[status]}`}
                          aria-label={`${r.name}: ${labels[status]}. Change status`}
                          onClick={() =>
                            update({
                              ...notes,
                              roles: {
                                ...notes.roles,
                                [r.id]: (status + 1) % 3,
                              },
                            })
                          }
                        >
                          <RoleIcon role={r.id} />
                          <strong>{r.name}</strong>
                          <small>{labels[status]}</small>
                        </button>
                      );
                    })}
                </div>
              </section>
            ),
        )}
      </section>
      <section className="panel">
        <h2>Player roles</h2>
        <p className="muted">
          Record your guesses. Alive and dead status follows the public game
          announcements.
        </p>
        <div className="notebook-players">
          {game.players.map((p) => {
            const entry = notes.players[p.id] ?? { role: '', confidence: '' };
            const change = (value: Partial<typeof entry>) =>
              update({
                ...notes,
                players: { ...notes.players, [p.id]: { ...entry, ...value } },
              });
            return (
              <div className="notebook-player" key={p.id}>
                <div>
                  <strong>
                    {p.seat}. {p.name}
                  </strong>
                  <small>
                    {p.alive ? 'Alive' : 'Dead'}
                    {p.departed ? ' · Left table' : ''}
                  </small>
                </div>
                <label className="field">
                  <span>Suspected role</span>
                  <select
                    aria-label={`Role for ${p.name}`}
                    disabled={!ready}
                    value={entry.role}
                    onChange={(e) => change({ role: e.target.value })}
                  >
                    <option value="">Unknown</option>
                    {roles.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset
                  className="note-confidence"
                  aria-label={`Confidence for ${p.name}`}
                >
                  <button
                    type="button"
                    disabled={!ready}
                    className="confirm-role"
                    aria-label={`Confirmed role for ${p.name}`}
                    aria-pressed={entry.confidence === 'confirmed'}
                    title="Confirmed"
                    onClick={() =>
                      change({
                        confidence:
                          entry.confidence === 'confirmed' ? '' : 'confirmed',
                      })
                    }
                  >
                    <Check aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={!ready}
                    className="suspect-role"
                    aria-label={`Suspected role for ${p.name}`}
                    aria-pressed={entry.confidence === 'suspected'}
                    title="Suspected"
                    onClick={() =>
                      change({
                        confidence:
                          entry.confidence === 'suspected' ? '' : 'suspected',
                      })
                    }
                  >
                    <CircleHelp aria-hidden="true" />
                  </button>
                </fieldset>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <label className="field">
          <span>Personal notes</span>
          <textarea
            disabled={!ready}
            rows={10}
            maxLength={12000}
            value={notes.text}
            placeholder="Claims, clues, and questions…"
            onChange={(e) => update({ ...notes, text: e.target.value })}
          />
        </label>
      </section>
    </div>
  );
}
