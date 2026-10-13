'use client';
import { UiText } from '@/components/ui-text';
import AppLink from '@/components/app-link';
import { NightRite } from '@/components/rite/night-rite';
import { playCue } from '@/components/hub/audio';
import { haptic } from '@/lib/native/bridge';
import { ShareInvite } from '@/components/share-invite';
import { useKeepAwake, useKeepAwakeSetting } from '@/hooks/use-keep-awake';
import { LobbyExit } from '@/components/hub/lobby-exit';
import { GlossaryText } from '@/components/glossary-text';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerNotes } from '@/components/player-notes';
import { VoteChoices } from '@/components/vote-choices';
import { RolePicker } from '@/components/role-picker';
import { RoleAssignmentPalette } from '@/components/role-assignment-palette';
import { RoleIcon } from '@/components/role-icon';
import { MessageBadge } from '@/components/message-badge';
import { NightChoiceNotice } from '@/components/night-choice-notice';
import { StorytellerVote } from '@/components/storyteller-vote';
import { TableNightChoice } from '@/components/table-night-choice';
import { NightIntroduction } from '@/components/night-introduction';
import { SphinxGlimpse } from '@/components/sphinx-glimpse';
import { TableDawn } from '@/components/table-dawn';
import { GameEndPopup, SessionRecaps } from '@/components/session-recap';
import { TableSeating } from '@/components/table-seating';
import { PlayerAvatar } from '@/components/player-avatar';
import { AvatarPicker } from '@/components/avatar-picker';
import { TableAtmosphere } from '@/components/table-atmosphere';
import { SettingsPanel } from '@/components/hub/settings';
import { eligibleField } from '@/lib/game/choices';
import { newestView } from '@/lib/game/live';
import {
  Play,
  Users,
  MessageSquare,
  BookOpen,
  Settings,
  Radio,
  Check,
  X,
} from 'lucide-react';
import type { GameView } from '@/lib/game/view';
import type { Control, Field } from '@/lib/game/types';
import { role, scriptRoles, TEAM_ORDER, TEAM_NAMES } from '@/lib/game/types';
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
import { TableHistory } from '@/components/table-history';
import { TableMembership } from '@/components/table-membership';
import { RulesReference } from '@/components/rules-reference';
import { HelpMenu } from '@/components/tutorials/help-menu';
import { RoleTipsPanel } from '@/components/role-tips';
import { TableTutorials } from '@/components/tutorials/table-tutorials';

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
  if (field.type === 'hidden') return null;
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
    [settingsOpen, setSettingsOpen] = useState(false),
    [revealed, setRevealed] = useState(false),
    [chatPlayer, setChatPlayer] = useState('all'),
    [activeTab, setActiveTab] = useState('flow'),
    [compact, setCompact] = useState(false),
    [sandboxPov, setSandboxPov] = useState('host'),
    [selectedRole, setSelectedRole] = useState(''),
    [dropSeat, setDropSeat] = useState(''),
    [roleError, setRoleError] = useState('');
  // Keep phones from auto-locking while seated at this table (lobby through
  // game end). Leaving the table screen unmounts this and releases the lock.
  const { enabled: keepAwake } = useKeepAwakeSetting();
  useKeepAwake(keepAwake && !!game);
  const previousPhase = useRef<string | null>(null);
  const phase = game?.phase;
  useEffect(() => {
    if (phase && previousPhase.current && previousPhase.current !== phase)
      playCue();
    previousPhase.current = phase ?? null;
  }, [phase]);
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
  const checkConfirmation = ['start', 'dawn', 'finishDay'].includes(
    selected?.action ?? '',
  );
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
        timer = setTimeout(() => void poll(), document.hidden ? 15000 : 3000);
    };
    timer = setTimeout(() => void poll(), 0);
    const resume = () => {
      if (!document.hidden) void refresh(false);
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
    const id = setInterval(() => setNow(Date.now()), 1000);
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
    if (control.fields.every((field) => field.type === 'hidden')) {
      void submit(
        control,
        Object.fromEntries(
          control.fields.map((field) => [field.key, field.value ?? '']),
        ),
      );
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
          ...(control.action === 'edit'
            ? {
                base: Object.fromEntries(
                  control.fields.map((field) => [field.key, field.value ?? '']),
                ),
              }
            : {}),
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
      if (control.action === 'vote') haptic('tap');
      setSelected(null);
      setNotice(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }
  async function assignSeatRole(player: string, nextRole: string) {
    if (!game?.host || game.phase !== 'lobby' || busy) return;
    setBusy(true);
    setRoleError('');
    try {
      const response = await fetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assignRole',
          player,
          role: nextRole,
          version: game.version,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: string;
        game?: GameView;
      };
      if (!response.ok)
        throw Error(data.error || 'Could not assign the character.');
      if (data.game) applyGame(data.game);
      setNotice(data.summary ?? 'Character assigned.');
      setSelectedRole('');
    } catch (e) {
      setRoleError(
        e instanceof Error ? e.message : 'Could not assign the character.',
      );
      await refresh();
    } finally {
      setDropSeat('');
      setBusy(false);
    }
  }
  if (!game || authError)
    return (
      <main className="entry">
        <header className="brand">
          <span className="brand-mark">F</span>FEARVILLE
        </header>
        <section className="panel entry-panel">
          <h1>
            {authError ? 'Return to your seat' : 'Connecting to your table…'}
          </h1>
          {(error || connectionError) && (
            <p className="error" role="alert">
              {error || connectionError}
            </p>
          )}
          <AppLink className="quiet-link" href="/">
            Create or join a session →
          </AppLink>
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
        !online ||
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
  return (
    <TableAtmosphere night={game.phase === 'night'}>
      <TableTutorials
        game={game}
        tab={tab}
        setTab={setActiveTab}
        dialogOpen={!!selected || settingsOpen}
      />
      <main
        className={`table-shell ${game.host ? 'host-table' : 'player-table'}`}
      >
        <header className="brand table-header">
          <AppLink href="/" className="table-wordmark">
            Fearville
          </AppLink>
          <span className="table-identity">
            {game.host ? 'STORYTELLER' : name(game.me)}
          </span>
          <span className="table-script">{game.scriptName}</span>
          {game.roleDistribution && (
            <span className="table-setup">
              <strong>
                {game.customRoleDistribution ? 'Custom' : 'Standard'} setup ·{' '}
                <UiText
                  id="lobby.players"
                  values={{ count: game.players.length }}
                />
              </strong>
              <small>
                {TEAM_ORDER.filter(
                  (t) => t !== 'traveler' || game.script === 'horrors',
                )
                  .map(
                    (t) =>
                      `${game.roleDistribution![t]} ${game.roleDistribution![t] === 1 ? TEAM_NAMES[t].replace(/s$/, '') : TEAM_NAMES[t]}`,
                  )
                  .join(' · ')}
              </small>
            </span>
          )}
          <span className="connection">
            <Radio size={14} aria-hidden="true" />{' '}
            {online ? 'Live updates' : 'Reconnecting…'}
          </span>
          <span className="table-population">
            <UiText
              id="lobby.players"
              values={{ count: game.players.length }}
            />{' '}
            · {game.players.filter((p) => p.alive).length} alive
          </span>
          <button
            className="icon-button table-settings"
            data-tutorial="table-settings"
            aria-label="Settings"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings aria-hidden="true" />
          </button>
          <HelpMenu
            host={game.host}
            seated={!game.host && !game.sandboxHost}
            tipSession={`${game.code}:${game.me}`}
            ownGuides={ownGuide ? [ownGuide] : []}
          />
        </header>
        <LobbyExit game={game} />
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
            automatically. Actions are disabled until then. Timers continue on
            the server.
          </p>
        )}
        <div className="table-title">
          <div>
            <h1>
              {game.phase === 'lobby'
                ? 'Gather your town.'
                : game.phase === 'ended'
                  ? game.winner + ' wins.'
                  : `${game.phaseLabel}${game.phase === 'night' ? ' ' + game.night : game.day ? ' · Day ' + game.day : ''}`}
            </h1>
          </div>
          <div className="timer-toolbar">
            {(displayDeadline || game.remaining) && (
              <div
                data-tutorial="clock"
                className={`clock-box ${(displayDeadline || game.remaining) && seconds <= 20 ? 'timer-urgent' : ''}`}
              >
                <span>
                  {nightWindowActive
                    ? 'NIGHT CHOICES'
                    : game.deadline
                      ? 'TIME REMAINING'
                      : 'PAUSED'}
                </span>
                <strong>{clock}</strong>
              </div>
            )}
            {game.host && (
              <div className="timer-actions">
                {game.controls
                  .filter((c) =>
                    ['pause', 'resume', 'extend'].includes(c.action),
                  )
                  .map((c) => button(c))}
              </div>
            )}
          </div>
        </div>
        <GameEndPopup
          game={game}
          refresh={refresh}
          onReturn={() => setActiveTab('flow')}
        />
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
        {game.glimpse && (
          <SphinxGlimpse
            key={game.glimpse.id}
            glimpse={game.glimpse}
            now={now + offset}
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
        <Tabs
          className="game-tabs"
          value={tab}
          onValueChange={(value) => setActiveTab(String(value))}
          orientation={compact || !game.host ? 'horizontal' : 'vertical'}
        >
          <TabsList className="table-tabs" aria-label="Game navigation">
            <TabsTrigger value="flow">
              <Play aria-hidden="true" />
              <span>
                <UiText
                  id={game.phase === 'lobby' ? 'lobby.tab' : 'flow.tab'}
                />
              </span>
            </TabsTrigger>
            {game.phase === 'lobby' && !game.host ? (
              <>
                <TabsTrigger value="cosmetic" data-tutorial="tab-cosmetic">
                  <Users aria-hidden="true" />
                  <span>Cosmetic</span>
                </TabsTrigger>
                <TabsTrigger value="recap">
                  <BookOpen aria-hidden="true" />
                  <span>Session Recap</span>
                </TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="seats" data-tutorial="tab-notes">
                  <Users aria-hidden="true" />
                  <span>{game.host ? 'Seats' : 'Notes'}</span>{' '}
                  <span className="count">{game.players.length}</span>
                </TabsTrigger>
                <TabsTrigger value="messages" data-tutorial="tab-messages">
                  <MessageSquare aria-hidden="true" />
                  <span>Messages</span>{' '}
                  <MessageBadge key={game.code + game.me} game={game} />
                </TabsTrigger>
              </>
            )}
            {game.host && (
              <TabsTrigger value="recap">
                <BookOpen aria-hidden="true" />
                <span>Session Recap</span>
              </TabsTrigger>
            )}
            <TabsTrigger
              value="script"
              aria-label="Rules & roles"
              data-tutorial="tab-rules"
            >
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
          <TabsContent value="cosmetic" data-tutorial="cosmetic-panel">
            {!game.host && game.phase === 'lobby' && (
              <>
                <AvatarPicker
                  key={'avatar:' + game.code + game.me}
                  game={game}
                  refresh={refresh}
                />
                <TableMembership
                  key={game.code + game.me}
                  game={game}
                  refresh={refresh}
                  cosmetic
                />
              </>
            )}
          </TabsContent>
          <TabsContent value="recap" data-tutorial="recap-panel">
            <SessionRecaps game={game} />
          </TabsContent>
          <TabsContent value="flow">
            {(!game.host || game.phase !== 'lobby') && (
              <NightRite key={`${game.code}:${game.me}:play`} game={game} />
            )}
            {game.character && (
              <RoleTipsPanel
                tips={game.character.tips}
                session={`${game.code}:${game.me}`}
              />
            )}
            {game.phase === 'lobby' && (
              <div data-tutorial="seating">
                <TableSeating game={game} refresh={refresh} />
              </div>
            )}
            <div className="workspace-grid flow-dashboard">
              {(game.host ||
                game.phase !== 'night' ||
                core.length > 0 ||
                game.hints.length > 0) && (
                <section
                  className="panel flow-panel"
                  data-tutorial="flow-panel"
                >
                  {game.phase !== 'night' && (
                    <p className="eyebrow">
                      {game.phase === 'lobby' ? 'SESSION SETUP' : 'TOWN SQUARE'}
                    </p>
                  )}
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
                      <p data-tutorial="script">
                        <strong>Selected script:</strong> {game.scriptName}
                      </p>
                      <p>
                        <strong>Storyteller:</strong> {game.hostName}
                      </p>
                      <div className="code-display">{game.code}</div>
                      {game.host && !game.sandboxHost && (
                        <ShareInvite code={game.code} />
                      )}
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
                      <div data-tutorial="invite-friends">
                        <InviteFriends code={game.code} />
                      </div>
                    </>
                  ) : game.phase === 'night' ? (
                    game.host ? (
                      <>
                        <h2>
                          {pendingDeath
                            ? pendingDeath.title
                            : game.pendingBodyguard
                              ? 'Waiting for the Bodyguard'
                              : first?.name || 'The night is complete.'}
                        </h2>
                        <p className="muted">
                          {pendingDeath
                            ? 'Resolve this death before the next night task: prevention, the Fateweaver, then any triggered abilities.'
                            : game.pendingBodyguard
                              ? `${game.pendingBodyguard} has been told who will die and may take their place.`
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
                    ) : null
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
                        <section
                          className="public-votes"
                          aria-label="Live votes"
                        >
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
                            Voting ends as soon as all eligible players answer.
                            The nominee does not vote. After voting, nominations
                            resume with 30 extra seconds.
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
                                  Unanswered votes are recorded as abstentions
                                  when voting closes.
                                </p>
                                {b.correctable && (
                                  <p className="hint">
                                    Storyteller: change a vote below before the
                                    next nomination. Totals update immediately.
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
                                    {b.correctable &&
                                      b.eligible.includes(id) && (
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
                  <div className="actions" data-tutorial="flow-actions">
                    {core.map((c, i) => button(c, i === 0))}
                  </div>
                </section>
              )}
              {!game.host && game.phase !== 'lobby' && game.character && (
                <section className="panel character-panel">
                  <button
                    className="secondary full"
                    data-tutorial="character-reveal"
                    onClick={() => setRevealed(!revealed)}
                  >
                    {revealed ? 'Hide character' : 'Reveal my character'}
                  </button>
                  {revealed && (
                    <div className="character-reveal">
                      <h2>{game.character.name}</h2>
                      <p className="alignment">
                        {game.character.alignment} team
                      </p>
                      <p>
                        <GlossaryText text={game.character.description} />
                      </p>
                    </div>
                  )}
                </section>
              )}
            </div>
          </TabsContent>
          <TabsContent value="seats" keepMounted>
            {!game.host && (
              <>
                {game.phase !== 'lobby' && (
                  <div data-tutorial="notes-panel">
                    <PlayerNotes
                      key={'notes:' + game.code + game.me + game.gameStartedAt}
                      game={game}
                    />
                  </div>
                )}
              </>
            )}
            {game.host && (
              <>
                {game.phase === 'lobby' && (
                  <TableMembership
                    key={`host-membership:${game.code}`}
                    game={game}
                    refresh={refresh}
                  />
                )}
                {game.phase === 'lobby' && (
                  <section className="panel">
                    <h2>{game.scriptName}</h2>
                    {game.controls
                      .filter((c) => c.action === 'setScript')
                      .map((c) => button(c))}
                    <h3>Role distribution</h3>
                    <p className="muted">
                      {game.customRoleDistribution
                        ? 'Custom counts are visible to everyone at the table.'
                        : 'Standard counts are visible to everyone at the table.'}
                    </p>
                    <div className="actions">
                      {game.controls
                        .filter((c) =>
                          [
                            'setRoleDistribution',
                            'resetRoleDistribution',
                          ].includes(c.action),
                        )
                        .map((c) => button(c))}
                    </div>
                  </section>
                )}
                {game.host && game.phase === 'lobby' && (
                  <RolePicker
                    key={`${game.script}:${game.players.map((p) => p.role).join(',')}`}
                    game={game}
                    refresh={refresh}
                  />
                )}

                {game.host && game.phase === 'lobby' && (
                  <section className="panel">
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
                {game.phase === 'lobby' && roleError && (
                  <p className="error" role="alert">
                    {roleError}
                  </p>
                )}
                <div
                  className={
                    game.phase === 'lobby' ? 'role-assignment-layout' : ''
                  }
                >
                  {game.phase === 'lobby' && (
                    <RoleAssignmentPalette
                      game={game}
                      selected={selectedRole}
                      onSelect={setSelectedRole}
                    />
                  )}
                  <div className="seat-grid">
                    {game.players.map((p) => (
                      <section
                        className={`panel seat-card${dropSeat === p.id ? ' role-drop-target' : ''}`}
                        key={p.id}
                        onDragOver={(event) => {
                          if (game.phase !== 'lobby') return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          setDropSeat(p.id);
                        }}
                        onDragLeave={() => setDropSeat('')}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDropSeat('');
                          void assignSeatRole(
                            p.id,
                            event.dataTransfer.getData('text/plain'),
                          );
                        }}
                      >
                        <PlayerAvatar
                          avatar={p.avatar}
                          id={p.id}
                          dead={!p.alive}
                          deathEffect={p.deathEffect}
                          publicDead={!p.publicAlive}
                        />
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
                            {game.phase === 'lobby' && (
                              <div className="seat-role-assignment">
                                <label className="field">
                                  Assign character
                                  <select
                                    aria-label={`Assign character to ${p.name}`}
                                    disabled={busy}
                                    value={p.role ?? ''}
                                    onChange={(event) =>
                                      void assignSeatRole(
                                        p.id,
                                        event.target.value,
                                      )
                                    }
                                  >
                                    <option value="">Choose a character</option>
                                    {scriptRoles(game.script).map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                {selectedRole && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                      void assignSeatRole(p.id, selectedRole)
                                    }
                                  >
                                    Assign {role(selectedRole)?.name}
                                  </button>
                                )}
                              </div>
                            )}
                            <p className="tags">
                              {p.feared ? 'FEARED ' : ''}
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
                                  c.action === 'edit' &&
                                  c.fields[0].value === p.id,
                              )!,
                            )}
                          </>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              </>
            )}
          </TabsContent>
          <TabsContent
            value="messages"
            keepMounted
            data-tutorial="messages-panel"
          >
            <TableMessages
              key={`${game.code}:${game.me}:${game.gameStartedAt}:${game.phase}:${game.channel?.id ?? ''}`}
              game={game}
              recipient={chatPlayer}
              onRecipient={setChatPlayer}
              online={online}
              refresh={refresh}
              active={activeTab === 'messages'}
            />
          </TabsContent>
          <TabsContent value="script">
            <div className="panel" data-tutorial="rules-panel">
              <h2>Rules & roles</h2>
              <AppLink className="quiet-link" href="/rules">
                Open the full reference page →
              </AppLink>
              <RulesReference script={game.script} riteGuides={riteGuides} />
            </div>
          </TabsContent>
          {game.host && (
            <TabsContent value="control">
              <NightRite
                key={`${game.code}:${game.me}:setup`}
                game={game}
                mode="setup"
              />
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
                          <p>
                            <GlossaryText text={c.description} />
                          </p>
                          {button(c)}
                        </div>
                      ))}
                  </div>
                </section>
                <TableHistory
                  key={`${game.code}:${game.me}:${game.gameStartedAt}`}
                  game={game}
                  open={open}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
        <Dialog
          open={!!selected}
          onOpenChange={(v) => {
            if (!v && !busy) setSelected(null);
          }}
        >
          <DialogContent className="action-dialog">
            <DialogHeader>
              <DialogTitle>{actionControl?.title}</DialogTitle>
              <DialogDescription>
                {actionControl && (
                  <GlossaryText text={actionControl.description} />
                )}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {confirmation && (
                <>
                  {confirmation.ability && (
                    <div className="ability-reminder">
                      <strong>
                        {confirmation.playerName || 'Night task'} ability
                      </strong>
                      <p>
                        <GlossaryText text={confirmation.ability} />
                      </p>
                    </div>
                  )}
                  <div className="status-bubbles" aria-label="Player status">
                    {confirmation.statuses.map((status) => (
                      <button
                        type="button"
                        key={status.key}
                        className={
                          status.active ? 'status-active' : 'status-inactive'
                        }
                        disabled={busy}
                        aria-pressed={status.active}
                        aria-label={
                          status.locked
                            ? `Edit ${confirmation.playerName}'s character`
                            : `${status.active ? 'Remove' : 'Add'} ${status.name.toLowerCase()} for ${confirmation.playerName}`
                        }
                        onClick={() => {
                          if (status.locked) {
                            const edit = game.controls.find(
                              (control) =>
                                control.action === 'edit' &&
                                control.fields[0]?.value ===
                                  confirmation.playerId,
                            );
                            if (edit) open(edit);
                            return;
                          }
                          if (status.key === 'redirected' && !status.active) {
                            open({
                              action: 'setPlayerStatus',
                              title: `Redirect ${confirmation.playerName}`,
                              description:
                                'Choose the player whose ability receives the redirect.',
                              fields: [
                                {
                                  key: 'player',
                                  label: '',
                                  type: 'hidden',
                                  value: confirmation.playerId,
                                },
                                {
                                  key: 'status',
                                  label: '',
                                  type: 'hidden',
                                  value: status.key,
                                },
                                {
                                  key: 'active',
                                  label: '',
                                  type: 'hidden',
                                  value: true,
                                },
                                {
                                  key: 'night',
                                  label: '',
                                  type: 'hidden',
                                  value: game.night,
                                },
                                {
                                  key: 'target',
                                  label: 'Redirect target',
                                  type: 'select',
                                  required: true,
                                  options: game.players
                                    .filter(
                                      (player) =>
                                        player.id !== confirmation.playerId,
                                    )
                                    .map((player) => ({
                                      value: player.id,
                                      label: player.name,
                                    })),
                                  value:
                                    game.players.find(
                                      (player) =>
                                        player.id !== confirmation.playerId,
                                    )?.id ?? '',
                                },
                              ],
                            });
                            return;
                          }
                          void submit(
                            {
                              action: 'setPlayerStatus',
                              title: 'Change player state',
                              description: '',
                              fields: [],
                            },
                            {
                              player: confirmation.playerId,
                              status: status.key,
                              active: !status.active,
                              night: game.night,
                            },
                          );
                        }}
                      >
                        {status.active
                          ? status.name
                          : `Not ${status.name.toLowerCase()}`}
                      </button>
                    ))}
                  </div>
                </>
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
                        !options.some(
                          (o) => o.value === String(next[field.key]),
                        )
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
              {checkConfirmation ? (
                <div className="confirmation-actions">
                  <button
                    type="button"
                    className="confirmation-no"
                    aria-label="Cancel"
                    disabled={busy}
                    onClick={() => setSelected(null)}
                  >
                    <X aria-hidden="true" />
                  </button>
                  <button
                    className="confirmation-yes"
                    aria-label="Confirm"
                    disabled={busy || !online}
                  >
                    <Check aria-hidden="true" />
                  </button>
                </div>
              ) : (
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
              )}
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="settings-dialog">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
            </DialogHeader>
            <SettingsPanel />
          </DialogContent>
        </Dialog>
      </main>
    </TableAtmosphere>
  );
}
