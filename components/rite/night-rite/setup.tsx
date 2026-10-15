'use client';
import { useState } from 'react';
import { useRemoteSwitches } from '@/components/remote-switches';
import { publicEnabled } from '@/lib/flags/catalog';
import type { GameView } from '@/lib/game/view';
import { PATTERNS, type Plan, type RiteConfig } from '@/lib/rite/types';
import { type Send } from './shell.tsx';
export function RiteSetup({
  game,
  config,
  plans,
  send,
  busy,
}: {
  game: GameView;
  config: RiteConfig;
  plans: Plan[];
  send: Send;
  busy: boolean;
}) {
  const [stored, setDraft] = useState(config),
    [storedTeams, setTeams] = useState(plans);
  const update = (key: keyof RiteConfig, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  // FEAR-122: switched-off puzzles leave new-game setup (the server refuses them).
  const switches = useRemoteSwitches();
  const available = (kind: string) => publicEnabled(switches, 'rite.' + kind);
  const riteAvailable = publicEnabled(switches, 'rite');
  const kept = stored.patterns.filter(available);
  const draft: RiteConfig = {
    ...stored,
    patterns: kept.length ? kept : stored.patterns,
    enabled: stored.enabled && riteAvailable && kept.length > 0,
  };
  const teams = storedTeams.some((t) => !available(t.kind)) ? [] : storedTeams;
  return (
    <form
      className="rite-setup"
      data-tutorial="rite-setup"
      onSubmit={(e) => {
        e.preventDefault();
        void send('configureRite', {
          config: draft,
          ...(teams.length ? { plans: teams } : {}),
        });
      }}
    >
      <label className="rite-check">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={!riteAvailable}
          onChange={(e) => update('enabled', e.target.checked)}
        />{' '}
        Enable Night Rite
        {!riteAvailable && ' (unavailable right now)'}
      </label>
      <label className="rite-check">
        <input
          type="checkbox"
          checked={!!draft.timed}
          onChange={(e) => update('timed', e.target.checked)}
        />{' '}
        Use timed windows and 5-second turns
      </label>
      {draft.timed && (
        <div className="rite-settings">
          <label className="field">
            Character task window (seconds)
            <input
              type="number"
              min={0}
              max={120}
              value={draft.lockSeconds}
              onChange={(e) => update('lockSeconds', Number(e.target.value))}
            />
          </label>
          <label className="field">
            Puzzle window (seconds)
            <input
              type="number"
              min={60}
              max={300}
              value={draft.windowSeconds}
              onChange={(e) => update('windowSeconds', Number(e.target.value))}
            />
          </label>
        </div>
      )}
      <fieldset>
        <legend>Puzzle patterns</legend>
        {Object.entries(PATTERNS)
          .filter(([kind]) => available(kind))
          .map(([kind, title]) => (
            <label key={kind} className="rite-check">
              <input
                type="checkbox"
                checked={draft.patterns.includes(kind as keyof typeof PATTERNS)}
                onChange={(e) =>
                  update(
                    'patterns',
                    e.target.checked
                      ? [...draft.patterns, kind]
                      : draft.patterns.filter((p) => p !== kind),
                  )
                }
              />
              {title}
            </label>
          ))}
      </fieldset>
      <div className="rite-settings">
        {[
          { key: 'opensNight', title: 'Opening night', min: 2, max: 20 },
          {
            key: 'ritualFirstNight',
            title: 'Divination first attempt',
            min: 2,
            max: 20,
          },
          {
            key: 'forgedPerEvil',
            title: 'Forged clues per Evil player',
            min: 0,
            max: 4,
          },
        ].map((f) => (
          <label className="field" key={f.key}>
            {f.title}
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={Number(draft[f.key as keyof RiteConfig])}
              onChange={(e) =>
                update(f.key as keyof RiteConfig, Number(e.target.value))
              }
            />
          </label>
        ))}
        <label className="field">
          Vigils needed (%)
          <input
            type="number"
            min="1"
            max="100"
            value={Math.round(draft.threshold * 100)}
            onChange={(e) => update('threshold', Number(e.target.value) / 100)}
          />
        </label>
      </div>
      <label className="rite-check">
        <input
          type="checkbox"
          checked={draft.notifyCompletion}
          onChange={(e) => update('notifyCompletion', e.target.checked)}
        />{' '}
        Privately notify completed vigils
      </label>
      {teams.length > 0 && (
        <fieldset>
          <legend>Vigil membership</legend>
          <p className="hint">
            Keep teams as equal as possible. Dead players keep their team.
            Divination needs exactly three.
          </p>
          {teams.map((t, i) => (
            <label className="field" key={t.id}>
              Vigil {i + 1}
              <select
                value={t.kind}
                onChange={(e) =>
                  setTeams((ts) =>
                    ts.map((q) =>
                      q.id === t.id
                        ? { ...q, kind: e.target.value as Plan['kind'] }
                        : q,
                    ),
                  )
                }
              >
                {draft.patterns.map((p) => (
                  <option key={p} value={p}>
                    {PATTERNS[p]}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {game.players
            .filter((p) => !p.departed)
            .map((p) => (
              <label className="field" key={p.id}>
                {p.name}
                <select
                  value={teams.find((t) => t.members.includes(p.id))?.id ?? ''}
                  onChange={(e) =>
                    setTeams((ts) =>
                      ts.map((t) => ({
                        ...t,
                        members:
                          t.id === e.target.value
                            ? [...t.members, p.id]
                            : t.members.filter((id) => id !== p.id),
                      })),
                    )
                  }
                >
                  {teams.map((t, i) => (
                    <option key={t.id} value={t.id}>
                      Vigil {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </fieldset>
      )}
      <div className="rite-buttons">
        <button className="primary" disabled={busy}>
          Save Rite setup
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || game.players.length < 2}
          onClick={() =>
            void send('configureRite', { config: draft, redeal: true })
          }
        >
          Assign vigils automatically
        </button>
      </div>
      <p className="hint">
        Completion refreshes spent abilities for all alignments. Starting
        information returns the next night. There is no night-8 hard cap.
      </p>
    </form>
  );
}
