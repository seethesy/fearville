'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleHelp } from 'lucide-react';
import { scriptRoles } from '@/lib/game/types';
import type { GameView } from '@/lib/game/view';
import { RoleIcon } from './role-icon';
import { PlayerAvatar } from './player-avatar';
type Notebook = {
  roles: Record<string, number>;
  players: Record<string, { role: string; confidence: string }>;
  text: string;
};
const empty = (): Notebook => ({ roles: {}, players: {}, text: '' });
const colors = ['red', 'yellow', 'green'];
const labels = ['Ruled out', 'Possible', 'In play'];
export function PlayerNotes({ game }: { game: GameView }) {
  const storageKey = `fearville-notes:${game.code}:${game.me}:${game.gameStartedAt}`;
  const [notes, setNotes] = useState<Notebook>(game.notebook ?? empty);
  const [initialNotebook] = useState(game.notebook);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const queued = useRef(Promise.resolve());
  const pending = useRef<Notebook | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const save = useCallback(
    (next: Notebook) => {
      setSaving(true);
      queued.current = queued.current.then(async () => {
        try {
          const r = await fetch('/api/game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              action: 'saveNotebook',
              started: game.gameStartedAt,
              notebook: next,
              ...(game.sandboxHost ? { pov: game.me } : {}),
            }),
          });
          const data = (await r.json()) as { error?: string };
          if (!r.ok) throw Error(data.error || 'Notes could not sync.');
          if (pending.current === next) {
            pending.current = null;
            try {
              localStorage.removeItem(storageKey + ':pending');
            } catch {
              /* Server save succeeded. */
            }
          }
          setError('');
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : 'Notes could not sync. Your device copy is saved.',
          );
        } finally {
          setSaving(false);
        }
      });
    },
    [game.gameStartedAt, game.me, game.sandboxHost, storageKey],
  );
  useEffect(() => {
    function flush() {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) save(pending.current);
    }
    function hidden() {
      if (document.visibilityState === 'hidden') flush();
    }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
      flush();
    };
  }, [save]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (
          raw &&
          (!initialNotebook || localStorage.getItem(storageKey + ':pending'))
        ) {
          const saved = JSON.parse(raw);
          if (
            saved &&
            typeof saved.text === 'string' &&
            saved.roles &&
            saved.players
          ) {
            setNotes(saved);
            pending.current = saved;
            save(saved);
          }
        }
      } catch {
        setError('Saved notes could not be loaded on this device.');
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey, initialNotebook, save]);
  function update(next: Notebook) {
    setNotes(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 400);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      localStorage.setItem(storageKey + ':pending', 'yes');
      setError('');
    } catch {
      setError(
        'Notes cannot be saved on this device. Keep this page open to retain them.',
      );
    }
  }
  const roles = scriptRoles(game.script);
  const seatCount = Math.max(
    5,
    game.players.length,
    ...game.players.map((p) => p.seat),
  );
  return (
    <div className="player-notebook">
      <section className="panel">
        <h2>Your private notebook</h2>
        <p className="muted">
          Private during play. Your notes and messages are revealed to everyone
          in the session recap after the game ends. Notes also save on this
          device.
        </p>
        <p className="hint" aria-live="polite">
          {saving ? 'Saving notes…' : 'Notes save automatically.'}
        </p>
        {error && (
          <button className="secondary" onClick={() => save(notes)}>
            Retry saving notes
          </button>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      <section className="panel notes-table-panel">
        <h2>The table</h2>
        <div className="seat-circle-scroll">
          <div
            className="seat-circle notes-circle"
            style={{
              minWidth: seatCount > 8 ? seatCount * 48 : 480,
              minHeight: seatCount > 8 ? seatCount * 43 : 460,
            }}
          >
            <div className="circle-center">
              Fearville
              <br />
              <small>{game.hostName} · Storyteller</small>
            </div>
            {Array.from({ length: seatCount }, (_, i) => {
              const player = game.players.find((p) => p.seat === i + 1);
              const angle = (2 * Math.PI * i) / seatCount - Math.PI / 2;
              return (
                <div
                  className={`circle-seat notes-seat${player && !player.alive ? ' is-dead' : ''}`}
                  key={i}
                  style={{
                    left: `${50 + 37 * Math.cos(angle)}%`,
                    top: `${50 + 36 * Math.sin(angle)}%`,
                  }}
                >
                  {player ? (
                    <>
                      <PlayerAvatar
                        avatar={player.avatar}
                        id={player.id}
                        dead={!player.alive}
                      />
                      <strong>
                        {player.name}
                        {player.id === game.me ? ' · you' : ''}
                      </strong>
                      <small>
                        Seat {i + 1} · {player.alive ? 'Alive' : 'Dead'}
                        {player.departed ? ' · Left' : ''}
                      </small>
                    </>
                  ) : (
                    <small>Seat {i + 1} · Empty</small>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Roles in the game</h2>
        <p>
          Tap to cycle: red (ruled out), yellow (possible), green (in play). All
          roles start as possible.
        </p>
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
