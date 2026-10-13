'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TableConnection } from '@/lib/game/socket-client';
import type { ViewEnvelope } from '@/lib/game/socket-protocol';
import type { GameView } from '@/lib/game/view';
import type { ActionTiming } from '@/lib/game/action-timing';
import { timedActionFetch } from '@/lib/game/action-timing';
import type { Command } from '@/lib/game/types';
export function useTableSocket({
  code,
  me,
  pov,
  onView,
  poll,
}: {
  code?: string;
  me?: string;
  pov?: string;
  onView: (view: GameView) => void;
  poll: () => Promise<void>;
}) {
  const [connected, setConnected] = useState(false);
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
    try {
      const sent = active.current?.send(command, id);
      if (!sent)
        return await timedActionFetch(input, {
          ...init,
          body: JSON.stringify(command),
        });
      let ack;
      try {
        ack = await sent;
      } catch {
        // The ack may have been lost after commit. HTTP uses the SAME id.
        return await timedActionFetch(input, {
          ...init,
          body: JSON.stringify(command),
        });
      }
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
      connect: () => {
        const url = new URL('/api/table/socket', location.href);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('code', code!);
        if (pov && pov !== 'host') url.searchParams.set('pov', pov);
        return new WebSocket(url);
      },
    });
    active.current = connection;
    connection.start();
    const resume = () => {
      if (!document.hidden) connection.resume();
    };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      connection.stop();
      if (active.current === connection) active.current = null;
      setConnected(false);
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [code, me, pov, poll, apply]);
  return { connected, fetch: actionFetch, ...timing };
}
