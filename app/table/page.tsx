'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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
import { ROLES } from '@/lib/game/types';
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
    [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/game', { cache: 'no-store' });
      const d = (await r.json()) as GameView & {
        error: string;
        recoveryKey: string;
      };
      if (!r.ok) {
        if (r.status === 401) setAuthError(true);
        throw Error(d.error);
      }
      setGame(d);
      setOffset(d.serverNow - Date.now());
      setOnline(true);
      setAuthError(false);
    } catch (e) {
      setOnline(false);
      setError(e instanceof Error ? e.message : 'Cannot connect.');
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), 2000);
    const resume = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refresh]);
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
    setValues({
      ...Object.fromEntries(control.fields.map((f) => [f.key, f.value ?? ''])),
      ...(control.action === 'vote' ? { ballot: game?.active?.id ?? '' } : {}),
    });

    setError('');
  }
  async function submit(control = selected, payload = values) {
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
      setGame(data.game);
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
          {error && (
            <p className="error" role="alert">
              {error}
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
  const seconds = Math.max(
    0,
    Math.ceil(
      game.deadline ? (game.deadline - now - offset) / 1000 : game.remaining,
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
  const button = (c: Control, primary = false) => (
    <button
      key={c.action + c.title}
      className={primary ? 'primary' : c.danger ? 'danger' : 'secondary'}
      onClick={() => open(c)}
      disabled={!online || busy}
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
        <span className="table-script">Trouble Brewing</span>
        <span className="session-code">
          <span>Session</span> {game.code}
        </span>
        <span className="connection">
          <Radio size={14} aria-hidden="true" />{' '}
          {online ? 'Connected' : 'Reconnecting…'}
        </span>
        <span className="table-population">
          {game.players.length} players ·{' '}
          {game.players.filter((p) => p.alive).length} alive
        </span>
      </header>
      {!online && (
        <p className="error" aria-live="polite">
          Connection interrupted. Actions are disabled until your table
          reconnects. Timers continue on the server.
        </p>
      )}
      <div className="table-title">
        <div>
          <p className="eyebrow">
            TROUBLE BREWING · {game.host ? 'STORYTELLER' : name(game.me)}
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
          <div className="clock-box">
            <span>
              {game.deadline
                ? 'TIME REMAINING'
                : game.remaining
                  ? 'PAUSED'
                  : 'AT THE TABLE'}
            </span>
            <strong>
              {game.remaining || game.deadline
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
      <Tabs
        className="game-tabs"
        value={activeTab}
        onValueChange={(value) => setActiveTab(String(value))}
        orientation={compact ? 'horizontal' : 'vertical'}
      >
        <TabsList className="table-tabs" aria-label="Game navigation">
          <TabsTrigger value="flow">
            <Play aria-hidden="true" />
            <span>Game flow</span>
          </TabsTrigger>
          <TabsTrigger value="seats">
            <Users aria-hidden="true" />
            <span>Seats</span>{' '}
            <span className="count">{game.players.length}</span>
          </TabsTrigger>
          <TabsTrigger value="messages">
            <MessageSquare aria-hidden="true" />
            <span>Messages</span>{' '}
            <span className="count">{game.messages.length}</span>
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
                    <h2>{first?.name || 'The night is complete.'}</h2>
                    <p className="muted">
                      {first
                        ? 'Speak privately with the acting player, record their choice, then resolve the action.'
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
                            : game.active.myVote === null
                              ? 'Your vote has not been submitted.'
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
                          game.active.eligible.filter(
                            (id) => typeof game.active!.votes[id] === 'boolean',
                          ).length
                        }
                        /{game.active.eligible.length} answered
                      </h3>
                      <p className="muted">
                        Voting ends as soon as all eligible players answer. The
                        nominee does not vote.
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
                                    : 'Waiting'}
                          </strong>
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
                            </p>
                            {Object.entries(b.votes).map(([id, yes]) => (
                              <p key={id}>
                                {name(id)}:{' '}
                                {id === b.target
                                  ? 'Nominee · not counted'
                                  : yes
                                    ? 'Yes'
                                    : 'No'}
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
                          ? ROLES.find((r) => r.id === p.role)?.name ||
                            'Unassigned'
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
        <TabsContent value="seats">
          <TableMembership
            key={game.code + game.me}
            game={game}
            refresh={refresh}
          />
          {game.host && game.phase === 'lobby' && (
            <section className="panel poll-result">
              <h2>Assign the town’s characters.</h2>
              <p className="muted">
                Edit each seat to choose its character manually, or start with a
                random setup and adjust it. Roles are revealed only when you
                begin the game.
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
                    {ROLES.find((r) => r.id === p.role)?.name ||
                      'Assign a character'}
                    {p.role === 'drunk' && (
                      <small>
                        Shown {ROLES.find((r) => r.id === p.shown)?.name || '—'}
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
            <RulesReference />
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
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {selected?.fields.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                value={values[f.key]}
                onChange={(v) => setValues({ ...values, [f.key]: v })}
              />
            ))}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy || !online}>
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
