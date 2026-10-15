'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TableConnection,
  type ConnectionPhase,
} from '@/lib/game/socket-client';
import { onLifecycle } from '@/lib/native/bridge';
import { currentClientHeader } from '@/lib/compat/client';
import { BUILD_EVENT } from '@/lib/compat/stale';
import type { ViewEnvelope } from '@/lib/game/socket-protocol';
import type { GameView } from '@/lib/game/view';
import type { ActionTiming } from '@/lib/game/action-timing';
import { timedActionFetch } from '@/lib/game/action-timing';
import type { Command } from '@/lib/game/types';
export function useTableSocket({
  code,
  me,
  pov,
  version,
  onView,
  poll,
}: {
  code?: string;
  me?: string;
  pov?: string;
  version?: number;
  onView: (view: GameView) => void;
  poll: () => Promise<void>;
}) {
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<ConnectionPhase>('connecting');
  const lastVersion = useRef(version ?? 0);
  lastVersion.current = version ?? 0;
  const [timing, setTiming] = useState<{ rtt?: number; push?: number }>({});
  const pending = useRef(new Map<string, number>());
  const active = useRef<TableConnection | null>(null);
  const actionFetch = useCallback(async (input: string, init: RequestInit) => {
    if (
      typeof init.body !== 'string' ||
      !['/api/game', '/api/rite'].includes(input)
    )
      return timedActionFetch(input, init);
    const id = crypto.randomUUID(),
      started = performance.now();
    const command = {
      ...JSON.parse(init.body),
      requestId: id,
      compactRecaps: true,
    } as Command;
    pending.current.set(id, started);
    if (pending.current.size > 100)
      pending.current.delete(pending.current.keys().next().value!);
    try {
      const sent = active.current?.send(command, id);
      if (!sent)
        return await timedActionFetch(input, {
          ...init,
          body: JSON.stringify(command),
        });
      const ack = await sent;
      if (!ack.ok) pending.current.delete(id);
      const result = ack.data ?? {
        error: ack.error,
        summary: ack.summary,
        version: ack.version,
      };
      return new Response(JSON.stringify(result), {
        status: ack.ok ? 200 : (ack.status ?? 400),
        headers: { 'Content-Type': 'application/json' },
      });
    } finally {
      setTiming((old) => ({ ...old, rtt: performance.now() - started }));
    }
  }, []);
  const apply = useCallback(
    (frame: ViewEnvelope) => {
      onView(frame.data);
      const sent = frame.cause ? pending.current.get(frame.cause) : undefined;
      if (sent !== undefined) {
        setTiming((old) => ({ ...old, push: performance.now() - sent }));
        pending.current.delete(frame.cause!);
      }
    },
    [onView],
  );
  useEffect(() => {
    const record = (event: Event) => {
      const detail = (event as CustomEvent<ActionTiming>).detail;
      if (detail.duration === undefined) {
        pending.current.set(detail.id, detail.started);
        if (pending.current.size > 100)
          pending.current.delete(pending.current.keys().next().value!);
      } else setTiming((old) => ({ ...old, rtt: detail.duration }));
    };
    window.addEventListener('fearville:action-timing', record);
    return () => window.removeEventListener('fearville:action-timing', record);
  }, []);
  useEffect(() => {
    const connection = new TableConnection({
      code: code ?? '',
      me: me ?? '',
      poll,
      view: apply,
      status: setConnected,
      phase: setPhase,
      version: () => lastVersion.current,
      client: currentClientHeader,
      protocol: (detail) =>
        window.dispatchEvent(new CustomEvent(BUILD_EVENT, { detail })),
      connect: () => {
        const url = new URL('/api/table/socket', location.href);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('code', code!);
        if (pov && pov !== 'host') url.searchParams.set('pov', pov);
        // Browsers can't set headers on a WebSocket; the gate reads this.
        url.searchParams.set('client', currentClientHeader());
        return new WebSocket(url);
      },
    });
    active.current = connection;
    connection.start();
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const reconnect = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => connection.resume(), 0);
    };
    const resume = () => {
      if (!document.hidden) reconnect();
    };
    const unsubscribe = onLifecycle((event) => {
      if (event === 'resume' || event === 'online') reconnect();
    });
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      connection.stop();
      clearTimeout(resumeTimer);
      if (active.current === connection) active.current = null;
      setConnected(false);
      unsubscribe();
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [code, me, pov, poll, apply]);
  return {
    connected,
    phase,
    retry: () => active.current?.resume(),
    fetch: actionFetch,
    ...timing,
  };
}
