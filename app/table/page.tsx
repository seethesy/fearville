'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerNotes } from '@/components/player-notes';
import { VoteChoices } from '@/components/vote-choices';
import { RolePicker } from '@/components/role-picker';
import { RoleIcon } from '@/components/role-icon';
import { MessageBadge } from '@/components/message-badge';
import { NightChoiceNotice } from '@/components/night-choice-notice';
import { StorytellerVote } from '@/components/storyteller-vote';
import { TableNightChoice } from '@/components/table-night-choice';
import { NightPuzzles } from '@/components/night-puzzles';
import { NightIntroduction } from '@/components/night-introduction';
import { TableDawn } from '@/components/table-dawn';
import { TableSeating } from '@/components/table-seating';
import { eligibleField } from '@/lib/game/choices';
import { newestView } from '@/lib/game/live';
import {
  Play,
  Users,
  MessageSquare,
  BookOpen,
  Settings,
  Radio,
} from 'lucide-react';
import type { GameView } from '@/lib/game/view';
import type { Control, Field } from '@/lib/game/types';
import { role } from '@/lib/game/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { InviteFriends } from '@/components/social/invite-friends';
import { RateStoryteller } from '@/components/social/rate-storyteller';
import { TableMessages } from '@/components/table-messages';
import { TableMembership } from '@/components/table-membership';
import { RulesReference } from '@/components/rules-reference';

type Values = Record<string, string | number | boolean>;
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.key === 'yes' && field.label === 'Vote')
    return (
      <div className="field">
        {field.label}
        <VoteChoices value={String(value)} onChange={onChange} />
      </div>
    );
  if (
    field.type === 'select' &&
    field.options &&
    (['outcome', 'winner'].includes(field.key) ||
      (field.options.length === 2 &&
        field.options.every((o) =>
          ['true', 'false', 'good', 'evil', 'yes', 'no'].includes(o.value),
        )))
  )
    return (
      <fieldset className="field">
        <legend>{field.label}</legend>
        <div className="short-choices">
          {field.options.map((o) => (
            <button
              type="button"
              className="secondary"
              key={o.value}
              aria-pressed={String(value) === o.value}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  if (field.type === 'checkbox')
    return (
      <label className="check-field">
        <Checkbox
          checked={!!value}
          onCheckedChange={(v) => onChange(v === true)}
        />
        {field.label}
      </label>
    );
  return (
    <label className="field">
      {field.label}
      {field.type === 'select' ? (
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => onChange(String(v ?? ''))}
        >
          <SelectTrigger className="select-field" aria-label={field.label}>
            <SelectValue>
              {field.options?.find((o) => o.value === String(value))?.label ||
                'Choose…'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === 'textarea' ? (
        <textarea
          rows={4}
          value={String(value ?? '')}
          maxLength={12000}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={field.type}
          value={String(value ?? '')}
          min={field.min}
          max={field.max}
          maxLength={field.key === 'name' ? 32 : 1000}
          required={field.required}
          onChange={(e) =>
            onChange(
              field.type === 'number' ? Number(e.target.value) : e.target.value,
            )
          }
        />
      )}{' '}
      {field.hint && <span className="hint">{field.hint}</span>}
    </label>
  );
}
export default function Table() {
  const [game, setGame] = useState<GameView | null>(null),
    [error, setError] = useState(''),
    [connectionError, setConnectionError] = useState(''),
    [authError, setAuthError] = useState(false),
    [online, setOnline] = useState(true),
    [now, setNow] = useState(() => Date.now()),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<Control | null>(null),
    [values, setValues] = useState<Values>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [recovery, setRecovery] = useState(''),
    [restore, setRestore] = useState(''),
    [revealed, setRevealed] = useState(false),
    [chatPlayer, setChatPlayer] = useState('all'),
    [activeTab, setActiveTab] = useState('flow'),
    [compact, setCompact] = useState(false),
    [sandboxPov, setSandboxPov] = useState('host');
  const [followChoice, setFollowChoice] = useState(true);
  const confirmation =
    selected?.action === 'night' &&
    game?.nightConfirmation?.task === values.task
      ? game.nightConfirmation
      : null;
  const actionControl = confirmation
    ? (game?.controls.find((c) => c.action === 'night') ?? selected)
    : selected;
  const effectiveValues: Values = {
    ...values,
    ...(confirmation ? { choiceId: confirmation.choice?.id ?? '' } : {}),
    ...(confirmation?.choice && followChoice
      ? {
          target: confirmation.choice.target,
          target2: confirmation.choice.target2,
          ...(confirmation.choice.target3
            ? { target3: confirmation.choice.target3 }
            : {}),
        }
      : {}),
  };
  const requestNumber = useRef(0);
  const inFlight = useRef<{
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);
  const cancelRefresh = useCallback(() => {
    ++requestNumber.current;
    inFlight.current?.controller.abort();
    inFlight.current = null;
  }, []);
  const applyGame = useCallback((incoming: GameView) => {
    setGame((current) => newestView(current, incoming));
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const refresh = useCallback(
    (force = true): Promise<void> => {
      if (inFlight.current && !force) return inFlight.current.promise;
      inFlight.current?.controller.abort();
      const number = ++requestNumber.current;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const promise = (async () => {
        try {
          const r = await fetch(
            `/api/game${sandboxPov === 'host' ? '' : `?pov=${encodeURIComponent(sandboxPov)}`}`,
            {
              cache: 'no-store',
              credentials: 'same-origin',
              signal: controller.signal,
            },
          );
          const d = (await r.json()) as GameView & { error?: string };
          if (number !== requestNumber.current) return;
          if (!r.ok) {
            if (r.status === 401) setAuthError(true);
            throw Error(d.error || 'Cannot connect to the table.');
          }
          applyGame(d);
          setOffset(d.serverNow - Date.now());
          setOnline(true);
          setAuthError(false);
          setConnectionError('');
        } catch (e) {
          if (number !== requestNumber.current) return;
          setOnline(false);
          setConnectionError(
            controller.signal.aborted
              ? 'The connection timed out. Retrying automatically…'
              : e instanceof Error
                ? e.message
                : 'Cannot connect. Retrying automatically…',
          );
        } finally {
          clearTimeout(timeout);
          if (number === requestNumber.current) inFlight.current = null;
        }
      })();
      inFlight.current = { controller, promise };
      return promise;
    },
    [applyGame, sandboxPov],
  );
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(false);
      if (!stopped)
        timer = setTimeout(() => void poll(), document.hidden ? 5000 : 1000);
    };
    timer = setTimeout(() => void poll(), 0);
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      cancelRefresh();
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh, cancelRefresh]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setRevealed(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  function open(control: Control) {
    if (control.action === 'chat') {
      setActiveTab('messages');
      return;
    }
    if (control.fields.length === 0) {
      void submit(control, {});
      return;
    }
    setSelected(control);
    setFollowChoice(true);
    setValues({
      ...Object.fromEntries(control.fields.map((f) => [f.key, f.value ?? ''])),
      ...(control.action === 'vote' ? { ballot: game?.active?.id ?? '' } : {}),
    });

    setError('');
  }
  async function submit(control = actionControl, payload = effectiveValues) {
    if (!control || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          action: control.action,
          ...(game?.sandboxHost && sandboxPov !== 'host'
            ? { pov: sandboxPov }
            : {}),

          version: game?.version,
        }),
      });
      const data = (await r.json()) as {
        error: string;
        summary: string;
        version: number;
        game: GameView;
      };
      if (!r.ok) {
        if (r.status === 409) {
          await refresh();
        }
        throw Error(data.error);
      }
      applyGame(data.game);
      setSelected(null);
      setNotice(data.summary);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    setBusy(true);
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          recoveryKey: restore.trim(),
        }),
      });
      const d = (await r.json()) as GameView & {
        error: string;
        recoveryKey: string;
      };
      if (!r.ok) throw Error(d.error);
      setRestore('');
      setError('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }
  if (!game || authError)
    return (
      <main className="entry">
        <header className="brand">
          <span className="brand-mark">F</span>FEARVILLE
        </header>
        <section className="panel recovery-panel">
          <h1>
            {authError ? 'Return to your seat' : 'Connecting to your table…'}
          </h1>
          {(error || connectionError) && (
            <p className="error" role="alert">
              {error || connectionError}
            </p>
          )}
          <Link className="quiet-link" href="/">
            Create or join a session →
          </Link>
          <label className="field">
            Recovery key
            <input
              type="password"
              autoComplete="off"
              value={restore}
              onChange={(e) => setRestore(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={busy || !restore}
            onClick={() => void recover()}
          >
            Restore session
          </button>
        </section>
      </main>
    );
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
  const chat = game.controls.find((c) => c.action === 'chat')!;
  const pendingDeath = game.controls.find((c) => c.action === 'resolveDeath');
  const button = (c: Control, primary = false) => (
    <button
      key={c.action + c.title}
      className={primary ? 'primary' : c.danger ? 'danger' : 'secondary'}
      onClick={() => open(c)}
      disabled={
        !online ||
        busy ||
        (nightWindowActive && ['night', 'nightSkip', 'dawn'].includes(c.action))
      }
    >
      {c.title}
    </button>
  );
  return (
    <main
      className={`table-shell ${game.host ? 'host-table' : 'player-table'}`}
    >
      <header className="brand table-header">
        <Link href="/" className="table-wordmark">
          Fearville
        </Link>
        <span className="table-identity">
          {game.host ? 'STORYTELLER' : name(game.me)}
        </span>
        <span className="table-script">{game.scriptName}</span>
        <span className="session-code">
          <span>Session</span> {game.code}
        </span>
        <span className="connection">
          <Radio size={14} aria-hidden="true" />{' '}
          {online ? 'Live updates' : 'Reconnecting…'}
        </span>
        <span className="table-population">
          {game.players.length} players ·{' '}
          {game.players.filter((p) => p.alive).length} alive
        </span>
      </header>
      {game.sandboxHost && (
        <section
          className="panel sandbox-toolbar"
          aria-label="Sandbox point of view"
        >
          <div>
            <p className="eyebrow">SANDBOX · TIMERS DISABLED</p>
            <strong>
              {sandboxPov === 'host'
                ? 'Storyteller view'
                : `Viewing as ${name(sandboxPov)}`}
            </strong>
          </div>
          <label className="field">
            Point of view
            <select
              value={sandboxPov}
              onChange={(event) => {
                setSelected(null);
                setSandboxPov(event.target.value);
              }}
            >
              <option value="host">Storyteller</option>
              {game.players
                .filter((player) => player.dummy)
                .map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
            </select>
          </label>
        </section>
      )}
      {!online && (
        <p className="error" aria-live="polite">
          {connectionError || 'Connection interrupted.'} Your table reconnects
          automatically. Actions are disabled until then. Timers continue on the
          server.
        </p>
      )}
      <div className="table-title">
        <div>
          <p className="eyebrow">
            {game.scriptName.toUpperCase()} ·{' '}
            {game.host ? 'STORYTELLER' : name(game.me)}
          </p>
          <h1>
            {game.phase === 'lobby'
              ? 'Gather your town.'
              : game.phase === 'ended'
                ? game.winner + ' wins.'
                : `${game.phaseLabel}${game.phase === 'night' ? ' ' + game.night : game.day ? ' · Day ' + game.day : ''}`}
          </h1>
        </div>
        <div className="timer-toolbar">
          <div
            className={`clock-box ${(displayDeadline || game.remaining) && seconds <= 20 ? 'timer-urgent' : ''}`}
          >
            <span>
              {nightWindowActive
                ? 'NIGHT CHOICES'
                : game.deadline
                  ? 'TIME REMAINING'
                  : game.remaining
                    ? 'PAUSED'
                    : 'AT THE TABLE'}
            </span>
            <strong>
              {game.remaining || displayDeadline
                ? clock
                : game.players.length.toString().padStart(2, '0')}
            </strong>
          </div>
          {game.host && (
            <div className="timer-actions">
              {game.controls
                .filter((c) => ['pause', 'resume', 'extend'].includes(c.action))
                .map((c) => button(c))}
            </div>
          )}
        </div>
      </div>
      {game.recaps.length > 0 &&
        (game.phase === 'lobby' || game.phase === 'ended') && (
          <section className="panel recap-panel">
            <p className="eyebrow">GAME RECAP</p>
            <h2>{game.recaps.at(-1)!.winner} wins</h2>
            <div className="recap-roles">
              {game.recaps.at(-1)!.players.map((player) => (
                <p key={player.id}>
                  <strong>{player.name}</strong> — {player.role}
                  {player.shown && player.shown !== player.role
                    ? ` (shown ${player.shown})`
                    : ''}
                </p>
              ))}
            </div>
            <details>
              <summary>
                View decisions ({game.recaps.at(-1)!.decisions.length})
              </summary>
              <ol className="recap-decisions">
                {game.recaps.at(-1)!.decisions.map((decision) => (
                  <li key={decision.id}>
                    <strong>{decision.actor}</strong>: {decision.text}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        )}
      {notice && (
        <div className="notice" aria-live="polite">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss update">
            Dismiss
          </button>
        </div>
      )}
      {!selected && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {game.host && (
        <NightChoiceNotice
          game={game}
          onReview={() => {
            const c = game.controls.find((c) => c.action === 'night');
            if (c) open(c);
          }}
        />
      )}
      {game.nightIntroduction && (
        <NightIntroduction
          key={game.nightIntroduction.id}
          information={game.nightIntroduction}
        />
      )}
      {game.nightChoice && (
        <TableNightChoice
          key={game.nightChoice.round + game.nightChoice.task}
          game={game}
          now={now + offset}
          prompt={game.nightChoice}
          refresh={refresh}
        />
      )}
      <TableDawn key={game.code + game.me} game={game} />
      {game.standardCounts && (
        <section
          className="panel composition-panel"
          aria-label="Standard character counts"
        >
          <strong>Standard setup · {game.players.length} players</strong>
          <p>
            {game.standardCounts[0]} Villagers · {game.standardCounts[1]} Fools
            · {game.standardCounts[2]} Haunts · {game.standardCounts[3]} Horror
          </p>
          <p className="hint">
            Starting counts before character abilities. Actual changes stay
            secret.
          </p>
        </section>
      )}
      <Tabs
        className="game-tabs"
        value={activeTab}
        onValueChange={(value) => setActiveTab(String(value))}
        orientation={compact || !game.host ? 'horizontal' : 'vertical'}
      >
        <TabsList className="table-tabs" aria-label="Game navigation">
          <TabsTrigger value="flow">
            <Play aria-hidden="true" />
            <span>Game flow</span>
          </TabsTrigger>
          <TabsTrigger value="seats">
            <Users aria-hidden="true" />
            <span>{game.host ? 'Seats' : 'Notes'}</span>{' '}
            <span className="count">{game.players.length}</span>
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare aria-hidden="true" />
            <span>Messages</span>{' '}
            <MessageBadge key={game.code + game.me} game={game} />
          </TabsTrigger>
          <TabsTrigger value="script" aria-label="Rules & roles">
            <BookOpen aria-hidden="true" />
            <span>Rules</span>
          </TabsTrigger>
          {game.host && (
            <TabsTrigger value="control">
              <Settings aria-hidden="true" />
              <span>Controls</span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="flow">
          {game.previousNightPoll && (
            <section
              className="panel poll-result"
              aria-label="Previous night poll result"
            >
              <p className="eyebrow">
                NIGHT {game.previousNightPoll.night} · TABLE FAVORITES
              </p>
              <h2>{game.previousNightPoll.question}</h2>
              <p>
                {game.previousNightPoll.winners.length
                  ? `${game.previousNightPoll.winners.length > 1 ? 'Tied favorites: ' : 'Table favorite: '}${game.previousNightPoll.winners.join(', ')}`
                  : 'No answers this time.'}
              </p>
            </section>
          )}
          <div className="workspace-grid flow-dashboard">
            <section className="panel flow-panel">
              <p className="eyebrow">
                {game.phase === 'night'
                  ? 'NIGHT ORDER'
                  : game.phase === 'lobby'
                    ? 'SESSION SETUP'
                    : 'TOWN SQUARE'}
              </p>
              {game.phase === 'lobby' ? (
                <>
                  <h2>
                    {game.host
                      ? 'Invite your players.'
                      : 'You’re at the table.'}
                  </h2>
                  <p className="muted">
                    {game.host
                      ? 'Share the code ' +
                        game.code +
                        '. Players join on their own devices. Randomly assign roles below, or choose each character manually in Seats.'
                      : 'Your Storyteller will assign characters and begin the game. Keep this screen open.'}
                  </p>
                  <div className="code-display">{game.code}</div>
                  {game.host && (
                    <div className="checklist">
                      <button
                        className="secondary"
                        onClick={() => setActiveTab('seats')}
                      >
                        Manually assign roles
                      </button>
                      {game.issues.length ? (
                        game.issues.map((s) => <p key={s}>{s}</p>)
                      ) : (
                        <p>All setup checks passed. Ready to deal.</p>
                      )}
                    </div>
                  )}
                  <InviteFriends code={game.code} />
                </>
              ) : game.phase === 'night' ? (
                game.host ? (
                  <>
                    <h2>
                      {pendingDeath
                        ? pendingDeath.title
                        : first?.name || 'The night is complete.'}
                    </h2>
                    <p className="muted">
                      {pendingDeath
                        ? 'Resolve this death before the next night task: prevention, the Fateweaver, then any triggered abilities.'
                        : first
                          ? game.nightConfirmation?.choice
                            ? 'The player sent their choice. Open the action to review and confirm it.'
                            : 'Waiting for the player’s choice, or open the action to enter it yourself.'
                          : 'Review the town, then announce dawn.'}
                    </p>
                    <ol className="night-list">
                      {game.tasks.map((t, i) => (
                        <li
                          key={t.key}
                          className={
                            t.done
                              ? 'completed'
                              : first?.key === t.key
                                ? 'current'
                                : ''
                          }
                        >
                          <span>
                            {t.done ? '✓' : String(i + 1).padStart(2, '0')}
                          </span>
                          {t.name}
                          <small>
                            {t.done
                              ? 'Complete'
                              : first?.key === t.key
                                ? 'Up next'
                                : ''}
                          </small>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <>
                    <h2>The town is asleep.</h2>
                    <p className="muted">
                      Check Messages for instructions from your Storyteller.
                      Reply there with your choices.
                    </p>
                    <NightPuzzles
                      key={`${game.code}:${game.me}:${game.night}`}
                    />
                    {game.nightPoll && (
                      <div className="night-poll">
                        <p className="eyebrow">TONIGHT’S POLL · JUST FOR FUN</p>
                        <h3>{game.nightPoll.question}</h3>
                        <p className="muted">
                          Everyone can play while waiting. Your night ability
                          still comes first. Only the favorite is shared after
                          dawn, never who voted.
                        </p>
                        {game.nightPoll.answer && (
                          <output>
                            Your answer: {name(game.nightPoll.answer)}. You can
                            change it until dawn.
                          </output>
                        )}
                      </div>
                    )}
                  </>
                )
              ) : (
                <>
                  <h2>
                    {game.active
                      ? name(game.active.target) + ' is nominated'
                      : game.phase === 'discovery'
                        ? 'Find a quiet conversation.'
                        : game.phase === 'discussion'
                          ? 'Let the town talk.'
                          : game.phase === 'nomination'
                            ? 'Who will you nominate?'
                            : game.phase === 'dayReview'
                              ? 'The day’s decision.'
                              : 'Thank you for playing.'}
                  </h2>
                  <p className="muted">
                    {game.active
                      ? `Nominated by ${name(game.active.by)}. ${game.active.threshold} yes votes needed to qualify for execution.`
                      : game.phase === 'discovery'
                        ? 'Speak with other players and compare what you know.'
                        : game.phase === 'discussion'
                          ? 'Share information and suspicions with the whole group.'
                          : game.phase === 'nomination'
                            ? 'Each living player may nominate once today.'
                            : game.phase === 'dayReview'
                              ? 'The Storyteller confirms the execution and any character effects before the next night.'
                              : ''}
                  </p>
                  {game.active && (
                    <p className="ballot-callout">
                      {game.phase === 'defense'
                        ? 'Defense is in progress.'
                        : game.host
                          ? 'Votes are visible to everyone.'
                          : !game.active.eligible.includes(game.me)
                            ? 'You do not vote on this nomination.'
                            : !game.active.myVoteSubmitted
                              ? 'Your vote has not been submitted.'
                              : game.active.myVote === null
                                ? 'Your vote: ABSTAIN'
                                : game.active.myVote
                                  ? 'Your vote: YES'
                                  : 'Your vote: NO'}
                    </p>
                  )}
                  {game.active && game.phase === 'voting' && (
                    <section className="public-votes" aria-label="Live votes">
                      <h3>
                        Live votes ·{' '}
                        {
                          game.active.eligible.filter((id) =>
                            Object.hasOwn(game.active!.votes, id),
                          ).length
                        }
                        /{game.active.eligible.length} answered
                      </h3>
                      <p className="muted">
                        Voting ends as soon as all eligible players answer. The
                        nominee does not vote. After voting, nominations resume
                        with 30 extra seconds.
                      </p>
                      {game.players.map((p) => (
                        <div className="membership-row" key={p.id}>
                          <span>{p.name}</span>
                          <strong>
                            {p.id === game.active!.target
                              ? 'Nominee'
                              : !game.active!.eligible.includes(p.id)
                                ? 'Not voting'
                                : game.active!.votes[p.id] === true
                                  ? 'Yes'
                                  : game.active!.votes[p.id] === false
                                    ? 'No'
                                    : game.active!.votes[p.id] === null
                                      ? 'Abstained'
                                      : 'Waiting'}
                          </strong>
                          {game.host &&
                            game.active!.eligible.includes(p.id) && (
                              <StorytellerVote
                                player={p.id}
                                name={p.name}
                                ballot={game.active!.id}
                                vote={game.active!.votes[p.id]}
                                version={game.version}
                                completed={false}
                                refresh={refresh}
                              />
                            )}
                        </div>
                      ))}
                    </section>
                  )}
                  {game.ballots.length > 0 && (
                    <div className="ballots">
                      {game.ballots.map((b) => (
                        <div key={b.id}>
                          <span>{name(b.target)}</span>
                          <strong>
                            {b.count} <small>yes</small>
                          </strong>
                          <details className="ballot-vote-details">
                            <summary>View submitted votes</summary>
                            <p className="muted">
                              Character rules may affect the counted total.
                              Unanswered votes are recorded as abstentions when
                              voting closes.
                            </p>
                            {b.correctable && (
                              <p className="hint">
                                Storyteller: change a vote below before the next
                                nomination. Totals update immediately.
                              </p>
                            )}
                            {Object.entries(b.votes).map(([id, yes]) => (
                              <p key={id}>
                                {name(id)}:{' '}
                                {id === b.target
                                  ? 'Nominee · not counted'
                                  : yes === null
                                    ? 'Abstained'
                                    : yes
                                      ? 'Yes'
                                      : 'No'}
                                {b.correctable && b.eligible.includes(id) && (
                                  <StorytellerVote
                                    player={id}
                                    name={name(id)}
                                    ballot={b.id}
                                    vote={yes}
                                    version={game.version}
                                    completed={true}
                                    refresh={refresh}
                                  />
                                )}
                              </p>
                            ))}
                          </details>
                        </div>
                      ))}
                      <p>
                        {game.leader.tied
                          ? 'Tied for the lead · no execution'
                          : game.leader.target
                            ? game.leader.name + ' leads the vote'
                            : 'No qualifying nominee'}
                      </p>
                    </div>
                  )}
                </>
              )}
              {game.phase === 'ended' && (
                <RateStoryteller code={game.code} host={game.host} />
              )}
              {game.hints.map((h) => (
                <p className="error" key={h}>
                  {h}
                </p>
              ))}
              <div className="actions">
                {core.map((c, i) => button(c, i === 0))}
              </div>
            </section>
            <aside className="panel character-panel">
              <p className="eyebrow">
                {game.host ? 'YOUR GRIMOIRE' : 'YOUR SEAT'}
              </p>
              {game.character ? (
                <>
                  <h2>
                    {revealed
                      ? game.character.name
                      : 'Your character is private.'}
                  </h2>
                  {revealed && (
                    <>
                      <p className="alignment">
                        {game.character.alignment} team
                      </p>
                      <p>{game.character.description}</p>
                    </>
                  )}
                  <button
                    className="secondary full"
                    onClick={() => setRevealed(!revealed)}
                  >
                    {revealed ? 'Hide character' : 'Reveal my character'}
                  </button>
                  <p className="hint">
                    Your character hides when you leave the app.
                  </p>
                </>
              ) : (
                <>
                  <h2>
                    {game.players.filter((p) => p.alive).length} living players
                  </h2>
                  <p className="muted">
                    {game.host
                      ? 'Actual roles and reminders are visible only to you.'
                      : 'Your character will appear here when the game starts.'}
                  </p>
                  {game.storytellerAbility && (
                    <p className="alignment">
                      Your Zealot ability: {game.storytellerAbility}
                    </p>
                  )}
                </>
              )}
              <div className="seat-mini-list">
                {game.players.map((p) => (
                  <div key={p.id}>
                    <span className="seat-number">
                      {p.seat.toString().padStart(2, '0')}
                    </span>
                    <div>
                      <strong>
                        {p.name}
                        {p.id === game.me ? ' · you' : ''}
                      </strong>
                      <small>
                        {game.host
                          ? `(${role(p.role ?? '')?.name || 'Unassigned'})`
                          : p.alive
                            ? 'Alive'
                            : p.ghost
                              ? 'Dead · one vote'
                              : 'Dead · no votes'}
                      </small>
                    </div>
                    <span className={p.alive ? 'alive-dot' : 'dead-label'}>
                      {p.alive ? '●' : 'DEAD'}
                    </span>
                  </div>
                ))}
              </div>
              {button(chat)}
              <p className="hint">
                Session data syncs across devices. Stay connected during play.
              </p>
            </aside>
            <section className="panel recent-messages">
              <div className="section-heading">
                <p className="eyebrow">PRIVATE MESSAGES</p>
                <button
                  className="text-action"
                  onClick={() => setActiveTab('messages')}
                >
                  View all
                </button>
              </div>
              {game.messages.length === 0 ? (
                <p className="muted">
                  No messages yet. Your conversations will appear here.
                </p>
              ) : (
                game.messages
                  .slice(-3)
                  .reverse()
                  .map((m) => (
                    <article className="message" key={m.id}>
                      <div>
                        <strong>
                          {m.from === 'host' ? 'Storyteller' : name(m.from)}
                        </strong>
                        <small>
                          {new Date(m.at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </small>
                      </div>
                      <p>{m.text}</p>
                    </article>
                  ))
              )}
              <div className="actions">{button(chat)}</div>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="seats" keepMounted>
          {!game.host && (
            <>
              <PlayerNotes key={'notes:' + game.code + game.me} game={game} />
              <TableMembership
                key={game.code + game.me}
                game={game}
                refresh={refresh}
              />
            </>
          )}
          {game.host && (
            <>
              {game.phase === 'lobby' && (
                <section className="panel">
                  <h2>{game.scriptName}</h2>
                  {game.controls
                    .filter((c) => c.action === 'setScript')
                    .map((c) => button(c))}
                </section>
              )}
              {game.host && game.phase === 'lobby' && (
                <RolePicker
                  key={`${game.script}:${game.players.map((p) => p.role).join(',')}`}
                  game={game}
                  refresh={refresh}
                />
              )}
              {game.host && <TableSeating game={game} refresh={refresh} />}
              <TableMembership
                key={game.code + game.me}
                game={game}
                refresh={refresh}
              />
              {game.host && game.phase === 'lobby' && (
                <section className="panel poll-result">
                  <h2>Assign the town’s characters.</h2>
                  <p className="muted">
                    Edit each seat to choose its character manually, or start
                    with a random setup and adjust it. Roles are revealed only
                    when you begin the game.
                  </p>
                  <div className="actions">
                    {game.controls
                      .filter((c) => c.action === 'randomAssign')
                      .map((c) => button(c, true))}
                    {game.controls
                      .filter((c) => c.action === 'configure')
                      .map((c) => button(c))}
                  </div>
                </section>
              )}
              <div className="seat-grid">
                {game.players.map((p) => (
                  <section className="panel seat-card" key={p.id}>
                    <p className="eyebrow">
                      SEAT {p.seat.toString().padStart(2, '0')} ·{' '}
                      {p.alive ? 'ALIVE' : 'DEAD'}
                    </p>
                    <h2>
                      {p.name}
                      {p.departed ? ' · Left table' : ''}
                    </h2>
                    {game.host && (
                      <p className="role-name">
                        <RoleIcon role={p.role ?? ''} /> (
                        {role(p.role ?? '')?.name || 'Assign a character'})
                        {p.role === 'drunk' && (
                          <small>
                            Shown {role(p.shown ?? '')?.name || '—'}
                          </small>
                        )}
                      </p>
                    )}
                    <p className="muted">
                      {p.ghost ? 'Dead vote available' : 'Dead vote spent'}
                      {p.nominated ? ' · Nominated today' : ''}
                      {p.hasNominated ? ' · Nomination used' : ''}
                    </p>
                    {game.host && (
                      <>
                        <p className="tags">
                          {p.poisoned ? 'POISONED ' : ''}
                          {p.protected ? 'PROTECTED ' : ''}
                          {p.used ? 'ABILITY USED' : ''}
                        </p>
                        {p.notes && <p>{p.notes}</p>}
                        <button
                          className="secondary"
                          onClick={() => {
                            setChatPlayer(p.id);
                            setActiveTab('messages');
                          }}
                        >
                          Open conversation
                        </button>
                        {button(
                          game.controls.find(
                            (c) =>
                              c.action === 'edit' && c.fields[0].value === p.id,
                          )!,
                        )}
                      </>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="messages" keepMounted>
          <TableMessages
            game={game}
            recipient={chatPlayer}
            onRecipient={setChatPlayer}
            online={online}
            refresh={refresh}
            active={activeTab === 'messages'}
          />
        </TabsContent>
        <TabsContent value="script">
          <div className="panel">
            <h2>Rules & roles</h2>
            <Link className="quiet-link" href="/rules">
              Open the full reference page →
            </Link>
            <RulesReference script={game.script} />
          </div>
        </TabsContent>
        {game.host && (
          <TabsContent value="control">
            <div className="workspace-grid">
              <section className="panel">
                <p className="eyebrow">STORYTELLER CONTROL</p>
                <h2>Your ruling, at every step.</h2>
                <div className="control-list">
                  {game.controls
                    .filter((c) =>
                      [
                        'configure',
                        'undo',
                        'rewind',
                        'end',
                        'overridePhase',
                      ].includes(c.action),
                    )
                    .map((c) => (
                      <div key={c.action}>
                        <p>{c.description}</p>
                        {button(c)}
                      </div>
                    ))}
                </div>
              </section>
              <section className="panel">
                <p className="eyebrow">DECISION HISTORY</p>
                {game.log
                  .slice()
                  .reverse()
                  .map((l) => (
                    <article className="log-entry" key={l.id}>
                      <small>{new Date(l.at).toLocaleTimeString()}</small>
                      <p>{l.text}</p>
                    </article>
                  ))}
              </section>
            </div>
          </TabsContent>
        )}
      </Tabs>
      <footer>
        <span>
          Session {game.code} · {game.hostName} is Storytelling
        </span>
        <button
          onClick={async () => {
            const r = await fetch('/api/session');
            const d = (await r.json()) as GameView & {
              error: string;
              recoveryKey: string;
            };
            if (r.ok) setRecovery(d.recoveryKey);
            else setError(d.error);
          }}
        >
          Save recovery key
        </button>
        <Link href="/account">Account & saved games</Link>
        <button onClick={() => setActiveTab('seats')}>Your name & table</button>
        <Link href="/rules">Rules & roles</Link>
        <Link href="/">Switch session</Link>
      </footer>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
      >
        <DialogContent className="action-dialog">
          <DialogHeader>
            <DialogTitle>{actionControl?.title}</DialogTitle>
            <DialogDescription>{actionControl?.description}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {confirmation?.poisoned && (
              <p className="error" role="alert">
                <strong>{confirmation.playerName} is poisoned.</strong> Treat
                this ability as impaired. Information may be false, and the
                ability must not have its normal effect.
              </p>
            )}
            {confirmation?.choice && (
              <div className="ballot-callout">
                <p>
                  {confirmation.choice.pass
                    ? 'The player passed.'
                    : [
                        [
                          confirmation.choice.target,
                          confirmation.choice.target2,
                          confirmation.choice.target3 ?? '',
                        ].filter(Boolean).length
                          ? 'Player selected: ' +
                            [
                              confirmation.choice.target,
                              confirmation.choice.target2,
                              confirmation.choice.target3 ?? '',
                            ]
                              .filter(Boolean)
                              .map(name)
                              .join(', ') +
                            '.'
                          : '',
                        confirmation.choice.text
                          ? `Question: “${confirmation.choice.text}”`
                          : '',
                        confirmation.choice.guesses?.length
                          ? 'Guesses: ' +
                            confirmation.choice.guesses
                              .map(
                                (g) =>
                                  `${name(g.player)} as ${role(g.role)?.name ?? g.role}`,
                              )
                              .join(', ') +
                            '.'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                </p>
                {!followChoice && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setFollowChoice(true)}
                  >
                    Use player’s choice
                  </button>
                )}
              </div>
            )}
            {actionControl?.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={eligibleField(f, actionControl, effectiveValues, game)}
                value={effectiveValues[f.key]}
                onChange={(v) => {
                  const next = { ...effectiveValues, [f.key]: v };
                  if (['target', 'target2', 'target3'].includes(f.key))
                    setFollowChoice(false);
                  for (const field of actionControl.fields) {
                    const options = eligibleField(
                      field,
                      actionControl,
                      next,
                      game,
                    ).options;
                    if (
                      options &&
                      next[field.key] &&
                      !options.some((o) => o.value === String(next[field.key]))
                    )
                      next[field.key] = '';
                  }
                  setValues(next);
                }}
              />
            ))}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button
              className="primary full"
              disabled={
                busy ||
                !online ||
                (selected?.action === 'night' && !confirmation)
              }
            >
              {busy ? 'Applying…' : selected?.title || 'Apply'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!recovery}
        onOpenChange={(v) => {
          if (!v) setRecovery('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your recovery key</DialogTitle>
            <DialogDescription>
              Keep this private. Anyone with this key can access your seat
              {game.host ? ' and Storyteller controls' : ''}. It expires after
              30 days.
            </DialogDescription>
          </DialogHeader>
          <textarea
            readOnly
            value={recovery}
            aria-label="Private recovery key"
          />
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(recovery);
                setNotice('Recovery key copied.');
                setRecovery('');
              } catch {
                setNotice('Select the key and copy it manually.');
              }
            }}
          >
            Copy key
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
