'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '@/lib/game/view';
import type { RiteView, RitePuzzleView } from '@/lib/rite/view';
import {
  PATTERNS,
  type Plan,
  type RiteConfig,
  type Triple,
  type Altar,
  type ControlName,
  type Squad,
} from '@/lib/rite/types';
import {
  CHARACTERS,
  LOCATIONS,
  ACTIVITIES,
  validTriples,
} from '@/lib/rite/grid';
import { CONTROL_COUNTS, OFFERINGS, controlLabel } from '@/lib/rite/ritual';
import {
  Wreckage,
  VialArt,
  PlaceArt,
  SymbolArt,
  AltarArt,
  CharacterArt,
  ActivityArt,
} from './art';
import { errorCue } from '@/components/hub/audio';
import { haptic } from '@/lib/native/bridge';
import { timedActionFetch } from '@/lib/game/action-timing';
type Reply = {
  rite: RiteView;
  serverNow: number;
  version: number;
  error?: string;
  summary?: string;
};
type Send = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<void>;
export function NightRite({
  game,
  mode = 'play',
}: {
  game: GameView;
  mode?: 'play' | 'setup';
}) {
  const [reply, setReply] = useState<Reply>({
      rite: game.rite,
      serverNow: game.serverNow,
      version: game.version,
    }),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [flash, setFlash] = useState(false);
  const latest = useRef(reply);
  const [clock, setClock] = useState(() => ({
    now: Date.now(),
    offset: game.serverNow - Date.now(),
  }));
  useEffect(() => {
    const timer = setInterval(
      () => setClock((old) => ({ ...old, now: Date.now() })),
      250,
    );
    return () => clearInterval(timer);
  }, []);
  const apply = useCallback((next: Reply) => {
    if (
      next.version > latest.current.version ||
      (next.version === latest.current.version &&
        next.serverNow >= latest.current.serverNow)
    ) {
      latest.current = next;
      const now = Date.now();
      setClock({ now, offset: next.serverNow - now });
      setReply(next);
    }
  }, []);
  useEffect(() => {
    apply({
      rite: game.rite,
      version: game.version,
      serverNow: game.serverNow,
    });
  }, [game.rite, game.version, game.serverNow, apply]);
  const fail = useCallback((message: string) => {
    setError(message);
    setFlash(true);
    errorCue();
    haptic('error');
    setTimeout(() => setFlash(false), 400);
  }, []);
  const send: Send = async (action, payload = {}) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const current = latest.current;
      const response = await timedActionFetch('/api/rite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          version: current.version,
          epoch: current.rite?.epoch,
          night: game.night,
          ...(game.sandboxHost && !game.host ? { pov: game.me } : {}),
          ...payload,
        }),
      });
      const next: Reply = await response.json();
      if (!response.ok)
        throw Error(next.error || 'That action could not be completed.');
      apply(next);
      setNotice(next.summary ?? '');
      if (next.summary?.includes('falters') || next.summary?.includes('ruined'))
        fail(next.summary);
      else if (!game.host) haptic('tap');
    } catch (e) {
      fail(
        e instanceof Error ? e.message : 'That action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };
  const r = reply.rite;
  const own = r && !r.host ? r.puzzle : null;
  const deadline = own?.vote?.deadline || own?.deadline || r?.windowEnd;
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - clock.now - clock.offset) / 1000))
    : null;
  const previous = useRef<{ ruined?: string }>({});
  useEffect(() => {
    if (own?.ruined && own.ruined !== previous.current.ruined)
      fail('That action could not be completed.');
    previous.current = { ruined: own?.ruined };
  }, [own, fail]);
  if (!game.host && !r) return null;
  if (
    mode === 'setup' &&
    (!game.host ||
      !r?.host ||
      !(
        game.phase === 'lobby' ||
        (r.status === 'dormant' && game.night < r.config.opensNight)
      ))
  )
    return null;
  return (
    <section
      className={'night-rite ' + (flash ? 'rite-flash' : '')}
      aria-label="Night Rite"
    >
      <header className="rite-heading">
        <p className="rite-eyebrow">THE TOWN’S NIGHT RITE</p>
        <h2>
          {mode === 'setup'
            ? 'Night vigil setup'
            : r?.status === 'complete'
              ? 'The Rite is complete.'
              : r && !r.host
                ? r.squad.title
                : 'Keep the candles burning.'}
        </h2>
      </header>
      {seconds !== null && (
        <p className="rite-state" role="timer">
          {seconds}s remaining
        </p>
      )}
      {r?.host ? (
        <>
          {mode === 'setup' &&
            (game.phase === 'lobby' ||
              (r.status === 'dormant' && game.night < r.config.opensNight)) && (
              <RiteSetup
                key={JSON.stringify([r.config, r.plans])}
                game={game}
                config={r.config}
                plans={r.plans}
                send={send}
                busy={busy}
              />
            )}
          {mode === 'play' && r.preparing && (
            <p className="rite-state">Preparing the vigils’ puzzles…</p>
          )}
          {mode === 'play' && r.squads.length > 0 && (
            <div className="rite-host">
              <p>
                {r.squads.filter((s) => s.completeNight).length} of{' '}
                {r.squads.length} vigils complete · {r.needed} needed
              </p>
              {r.squads.map((s) => (
                <HostVigil
                  key={s.id}
                  squad={s}
                  game={game}
                  send={send}
                  busy={busy}
                />
              ))}
              {r.status === 'open' && game.phase === 'night' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void send('riteForce')}
                >
                  Close Rite now
                </button>
              )}
            </div>
          )}
        </>
      ) : mode === 'setup' ? null : (
        r && (
          <>
            <p className="rite-meta">
              {game.phase === 'night'
                ? `Night ${game.night}`
                : `Day ${game.day}`}{' '}
              · Your vigil of {r.squad.members.length}
            </p>
            <div className="rite-roster">
              {r.squad.members.map((m) => (
                <span key={m.id} className={m.id === game.me ? 'you' : ''}>
                  <b>{m.name.charAt(0)}</b>
                  {m.id === game.me ? 'You' : m.name}
                </span>
              ))}
            </div>
            {!own ? (
              <p className="rite-state">
                {r.redealing
                  ? 'Your puzzle is preparing. Plan with your vigil.'
                  : `Your puzzle opens on night ${r.opensNight}. Meet your vigil and plan together.`}
              </p>
            ) : (
              <>
                {own.phase === 'lock' && (
                  <p className="rite-state">
                    Finish your character task. Your puzzle opens shortly.
                  </p>
                )}
                {own.phase === 'wait' && (
                  <p className="rite-state">
                    Waiting for your turn. Keep this screen open.
                  </p>
                )}
                {own.phase === 'locked' && (
                  <p className="rite-state">
                    Sealed for tonight. Wait for dawn.
                  </p>
                )}
                {own.phase === 'day' && (
                  <p className="rite-state">
                    Plan together by day. Act when night falls.
                  </p>
                )}
                {own.phase === 'done' && (
                  <p className="rite-state">Your vigil’s puzzle is complete.</p>
                )}
                {own.type === 'board' && (
                  <Escape puzzle={own} send={send} busy={busy} />
                )}
                {own.type === 'lab' && (
                  <Laboratory
                    key={own.turn ?? own.vote?.id ?? own.phase}
                    puzzle={own}
                    send={send}
                    busy={busy}
                  />
                )}
                {own.type === 'grid' && (
                  <Sphinx key={r.epoch} puzzle={own} send={send} busy={busy} />
                )}
                {own.type === 'ritual' && (
                  <Divination
                    key={JSON.stringify(own.altar)}
                    puzzle={own}
                    send={send}
                    busy={busy}
                    name={(id) =>
                      game.players.find((p) => p.id === id)?.name ?? 'Player'
                    }
                  />
                )}
              </>
            )}
          </>
        )
      )}
      {error && (
        <p className="rite-error" role="alert">
          {error}
        </p>
      )}
      {notice && !error && <output className="rite-notice">{notice}</output>}
    </section>
  );
}
function RiteSetup({
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
  const [draft, setDraft] = useState(config),
    [teams, setTeams] = useState(plans);
  const update = (key: keyof RiteConfig, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <form
      className="rite-setup"
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
          onChange={(e) => update('enabled', e.target.checked)}
        />{' '}
        Enable Night Rite
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
        {Object.entries(PATTERNS).map(([kind, title]) => (
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
function Escape({
  puzzle,
  send,
  busy,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
}) {
  const [selected, setSelected] = useState('');
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const blocks = puzzle.blocks ?? [],
    active = puzzle.phase === 'turn' && !busy;
  const move = (id: string, x: number, y: number) => {
    if (active)
      void send('riteBoardMove', { block: id, x, y, turn: puzzle.turn });
  };
  return (
    <div className="escape-puzzle">
      <div className="escape-board" ref={board}>
        <div className="escape-gate" aria-hidden="true">
          ✦ ❯❯
        </div>
        {blocks.map((b) => (
          <button
            key={b.id}
            className={'escape-piece ' + (selected === b.id ? 'selected' : '')}
            aria-label={`${b.key ? 'Red carriage' : b.kind}, ${b.horiz ? 'horizontal' : 'vertical'}, column ${b.x + 1}, row ${b.y + 1}`}
            aria-pressed={selected === b.id}
            style={{
              left: `${(b.x / 6) * 100}%`,
              top: `${(b.y / 6) * 100}%`,
              width: `${((b.horiz ? b.len : 1) / 6) * 100}%`,
              height: `${((b.horiz ? 1 : b.len) / 6) * 100}%`,
            }}
            onClick={() => setSelected(b.id)}
            onPointerDown={(e) => {
              setSelected(b.id);
              drag.current = { id: b.id, x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (!d || !board.current) return;
              const cell = board.current.clientWidth / 6,
                dx = Math.round((e.clientX - d.x) / cell),
                dy = Math.round((e.clientY - d.y) / cell);
              if (dx || dy) move(b.id, b.x + dx, b.y + dy);
            }}
            onKeyDown={(e) => {
              const delta = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[e.key];
              if (delta) {
                e.preventDefault();
                move(b.id, b.x + delta[0], b.y + delta[1]);
              }
            }}
          >
            <Wreckage block={b} />
          </button>
        ))}
      </div>
      <p className="hint">
        Slide a piece along its length. Get the red carriage through the gate.
        Tap a piece and use the arrows, or drag.
      </p>
      {selected && (
        <div className="rite-buttons">
          {[
            [-1, 0, '←'],
            [1, 0, '→'],
            [0, -1, '↑'],
            [0, 1, '↓'],
          ].map(([dx, dy, label]) => (
            <button
              className="secondary"
              key={label}
              aria-label={`Move selected piece ${label}`}
              disabled={!active}
              onClick={() => {
                const b = blocks.find((b) => b.id === selected);
                if (b) move(b.id, b.x + Number(dx), b.y + Number(dy));
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {active && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void send('ritePass', { turn: puzzle.turn })}
        >
          Pass
        </button>
      )}
    </div>
  );
}
function Laboratory({
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
function Sphinx({
  puzzle,
  send,
  busy,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
}) {
  const [placements, setPlacements] = useState<Triple[]>(() =>
    puzzle.placements?.length
      ? puzzle.placements
      : Array.from({ length: 5 }, (_, location) => ({
          location,
          character: -1,
          activity: -1,
        })),
  );
  const [token, setToken] = useState<{
    kind: 'character' | 'activity';
    id: number;
  } | null>(null);
  const first = useRef(true);
  const lastSent = useRef('');
  const sendLatest = useRef(send);
  useEffect(() => {
    sendLatest.current = send;
  }, [send]);
  const editable = ['day', 'turn'].includes(puzzle.phase);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!editable || busy) return;
    const serialized = JSON.stringify(placements);
    if (serialized === lastSent.current) return;
    const timer = setTimeout(() => {
      lastSent.current = serialized;
      void sendLatest.current('riteNotes', { placements });
    }, 500);
    return () => clearTimeout(timer);
  }, [placements, editable, busy]);
  const place = (
    location: number,
    kind: 'character' | 'activity',
    id: number,
  ) => {
    setPlacements((ps) =>
      ps.map((p) =>
        p.location === location
          ? { ...p, [kind]: p[kind] === id ? -1 : id }
          : p[kind] === id
            ? { ...p, [kind]: -1 }
            : p,
      ),
    );
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
function RitualControl({
  control,
  value,
  disabled,
  onChange,
}: {
  control: ControlName;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  if (control === 'candles')
    return (
      <>
        <AltarArt control={control} value={value} />
        <div className="rite-control-buttons">
          {['Red', 'White', 'Purple'].map((color, i) => (
            <button
              key={color}
              disabled={disabled}
              aria-pressed={!!(value & (1 << i))}
              onClick={() => onChange(value ^ (1 << i))}
            >
              {color} · {value & (1 << i) ? 'Lit' : 'Unlit'}
            </button>
          ))}
        </div>
      </>
    );
  if (control === 'offerings')
    return (
      <>
        <AltarArt control={control} value={value} />
        <div className="rite-control-buttons">
          {OFFERINGS[value].map((offering, slot) => (
            <label key={slot}>
              Slot {slot + 1}
              <select
                aria-label={`Offering slot ${slot + 1}`}
                disabled={disabled}
                value={offering}
                onChange={(e) => {
                  const next = [...OFFERINGS[value]],
                    other = next.indexOf(e.target.value);
                  [next[slot], next[other]] = [next[other], next[slot]];
                  onChange(
                    OFFERINGS.findIndex((p) =>
                      p.every((x, i) => x === next[i]),
                    ),
                  );
                }}
              >
                {['bone', 'feather', 'herb'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </>
    );
  if (control === 'chalice')
    return (
      <button
        className="rite-art-control"
        disabled={disabled}
        aria-label={`Chalice ${controlLabel(control, value)}. Tap to change level.`}
        onClick={() => onChange((value + 1) % 3)}
      >
        <AltarArt control={control} value={value} />
        <span>{controlLabel(control, value)} · Tap to change</span>
      </button>
    );
  return (
    <>
      <AltarArt control={control} value={value} />
      <div
        className={
          'rite-control-buttons ' + (control === 'dial' ? 'dial-marks' : '')
        }
      >
        {Array.from({ length: CONTROL_COUNTS[control] }, (_, v) => (
          <button
            key={v}
            disabled={disabled}
            aria-pressed={v === value}
            onClick={() => onChange(v)}
          >
            {controlLabel(control, v)}
          </button>
        ))}
      </div>
    </>
  );
}
function Divination({
  puzzle,
  send,
  busy,
  name,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
  name: (id: string) => string;
}) {
  const [tab, setTab] = useState('altar'),
    [page, setPage] = useState(0),
    [altar, setAltar] = useState<Altar>(puzzle.altar ?? []);
  return (
    <div
      className={
        'divination-puzzle ' + (puzzle.performed ? 'ritual-performed' : '')
      }
    >
      <div className="ritual-tabs" role="tablist" aria-label="Ritual pages">
        {['altar', 'omens', 'grimoire'].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === 'altar'
              ? 'Your altar'
              : t === 'omens'
                ? `Omens · ${name(puzzle.omensFor ?? '')}`
                : `Grimoire · ${name(puzzle.keeperFor ?? '')}`}
          </button>
        ))}
      </div>
      {tab === 'altar' && (
        <>
          <p className="hint">
            Your omens: {name(puzzle.myOmensHolder ?? '')} · Your grimoire:{' '}
            {name(puzzle.myKeeper ?? '')}
          </p>
          {altar.map((a) => (
            <div className="altar-control" key={a.control}>
              <h3>{a.control === 'dial' ? 'Moon dial' : a.control}</h3>
              <RitualControl
                control={a.control}
                value={a.value}
                disabled={busy || puzzle.phase !== 'turn' || puzzle.performed}
                onChange={(value) =>
                  setAltar((as) =>
                    as.map((x) =>
                      x.control === a.control ? { ...x, value } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          <button
            className="primary full"
            disabled={busy || puzzle.phase !== 'turn' || puzzle.performed}
            onClick={() => void send('riteRitualPerform', { altar })}
          >
            {puzzle.performed
              ? 'The ritual is performed'
              : puzzle.usedTonight
                ? 'Sealed until the next night'
                : 'Perform the ritual'}
          </button>
          <p className="hint">
            One attempt per night, from night {puzzle.firstAttemptNight}.{' '}
            {puzzle.result === false
              ? 'The ritual falters. Nothing more is revealed.'
              : ''}
          </p>
        </>
      )}
      {tab === 'omens' && (
        <>
          <h3>For {name(puzzle.omensFor ?? '')}’s ritual</h3>
          {puzzle.omens?.map((set, i) => (
            <div className="omen-card" key={i}>
              <b>{['I', 'II', 'III'][i]}</b>
              {set.map((symbol) => (
                <SymbolArt key={symbol} symbol={symbol} />
              ))}
            </div>
          ))}
          <p className="hint">
            Read the symbols aloud. Order inside a set does not matter. Sets are
            not labeled.
          </p>
        </>
      )}
      {tab === 'grimoire' && (
        <>
          <h3>You keep this book for {name(puzzle.keeperFor ?? '')}</h3>
          <div className="ritual-tabs">
            {puzzle.book?.map((p, i) => (
              <button
                key={p.control}
                aria-pressed={page === i}
                onClick={() => setPage(i)}
              >
                {p.control}
              </button>
            ))}
          </div>
          {puzzle.book?.[page]?.entries.map((e, i) => (
            <div className="grimoire-entry" key={i}>
              <div>
                {e.symbols.map((s) => (
                  <SymbolArt key={s} symbol={s} />
                ))}
              </div>
              <span>→</span>
              <div>
                <AltarArt
                  control={puzzle.book![page].control}
                  value={e.value}
                />
                <small>
                  {controlLabel(puzzle.book![page].control, e.value)}
                </small>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
function HostVigil({
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

