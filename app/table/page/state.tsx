'use client';
import { playCue } from '@/components/hub/audio';
import { haptic } from '@/lib/native/bridge';
import { useKeepAwake, useKeepAwakeSetting } from '@/hooks/use-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { newestView } from '@/lib/game/live';
import type { GameView } from '@/lib/game/view';
import type { Control } from '@/lib/game/types';
import { useTableSocket } from '@/hooks/use-table-socket';
import { type Values } from './fields.tsx';
export function useTableState() {
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
  const latestGame = useRef<GameView | null>(null);
  const applyGame = useCallback((incoming: GameView) => {
    const accepted = newestView(latestGame.current, incoming);
    if (accepted === latestGame.current) return;
    latestGame.current = accepted;
    setGame(accepted);
    setOffset(accepted.serverNow - Date.now());
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
            `/api/game?compactRecaps=1${sandboxPov === 'host' ? '' : `&pov=${encodeURIComponent(sandboxPov)}`}`,
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
    cancelRefresh();
    return cancelRefresh;
  }, [sandboxPov, cancelRefresh]);
  const socketPoll = useCallback(() => refresh(false), [refresh]);
  const receiveView = useCallback(
    (incoming: GameView) => {
      applyGame(incoming);
      setOnline(true);
      setAuthError(false);
      setConnectionError('');
    },
    [applyGame],
  );
  const socket = useTableSocket({
    code: game?.code,
    me: game?.sandboxHost ? sandboxPov : game?.me,
    pov: sandboxPov,
    version: game?.version,
    onView: receiveView,
    poll: socketPoll,
  });
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
    if (!socket.connected) return;
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
    if (!control || busy || !socket.connected) return;
    setBusy(true);
    setError('');
    try {
      const r = await socket.fetch('/api/game', {
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
    if (!game?.host || game.phase !== 'lobby' || busy || !socket.connected)
      return;
    setBusy(true);
    setRoleError('');
    try {
      const response = await socket.fetch('/api/game', {
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
  return {
    authError,
    connectionError,
    assignSeatRole,
    game,
    now,
    offset,
    open,
    socket,
    busy,
    activeTab,
    setActiveTab,
    selected,
    settingsOpen,
    online,
    setSettingsOpen,
    sandboxPov,
    setSelected,
    setSandboxPov,
    refresh,
    notice,
    setNotice,
    error,
    compact,
    setRevealed,
    revealed,
    roleError,
    selectedRole,
    setSelectedRole,
    dropSeat,
    setDropSeat,
    setChatPlayer,
    chatPlayer,
    actionControl,
    submit,
    confirmation,
    followChoice,
    setFollowChoice,
    effectiveValues,
    setValues,
    checkConfirmation,
  };
}
export type TableState = ReturnType<typeof useTableState>;
