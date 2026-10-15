'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '@/lib/game/view';
import type { RiteView, RitePuzzleView } from '@/lib/rite/view';
import { errorCue, playCue } from '@/components/hub/audio';
import { haptic } from '@/lib/native/bridge';
import { useTableActions, useTableOnline } from '@/hooks/use-table-actions';
import { optimisticPuzzle } from '@/lib/rite/optimistic';
import { RiteSetup } from './setup.tsx';
import { Escape } from './escape.tsx';
import { Laboratory } from './laboratory.tsx';
import { Sphinx } from './sphinx.tsx';
import { Divination } from './divination.tsx';
import { HostVigil } from './vigil.tsx';
import { InlineFeedback } from '@/components/feedback/inline';
export type Reply = {
  rite: RiteView;
  serverNow: number;
  version: number;
  error?: string;
  summary?: string;
};
export type Send = (
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
  const actionFetch = useTableActions();
  const online = useTableOnline();
  const [prediction, setPrediction] = useState<RitePuzzleView | null>(null);
  const sending = useRef(false);
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
    if (sending.current || !online) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const current = latest.current;
      if (current.rite && !current.rite.host && current.rite.puzzle)
        setPrediction(
          optimisticPuzzle(current.rite.puzzle, { action, ...payload }),
        );
      const response = await actionFetch('/api/rite', {
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
      sending.current = false;
      setPrediction(null);
      setBusy(false);
    }
  };
  const r = reply.rite;
  const own = r && !r.host ? (prediction ?? r.puzzle) : null;
  const deadline = own?.vote?.deadline || own?.deadline || r?.windowEnd;
  const seconds = deadline
    ? Math.max(0, Math.ceil((deadline - clock.now - clock.offset) / 1000))
    : null;
  const previous = useRef<{ ruined?: string; phase?: string }>({});
  useEffect(() => {
    if (own?.phase === 'turn' && previous.current.phase === 'wait') playCue();
    if (own?.ruined && own.ruined !== previous.current.ruined)
      fail('That action could not be completed.');
    previous.current = { ruined: own?.ruined, phase: own?.phase };
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
                busy={busy || !online}
              />
            )}
          {mode === 'play' && r.preparing && (
            <p className="rite-state">Preparing the vigils’ puzzles…</p>
          )}
          {mode === 'play' && r.squads.length > 0 && (
            <div className="rite-host" data-tutorial="rite-host">
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
                  busy={busy || !online}
                />
              ))}
              {r.status === 'open' && game.phase === 'night' && (
                <button
                  className="secondary"
                  disabled={busy || !online}
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
                  <>
                    <p className="rite-state">
                      Your vigil’s puzzle is complete.
                    </p>
                    {/* FEAR-174: rate this puzzle (sampled, dismissible). */}
                    <InlineFeedback
                      context="puzzle"
                      subject={own.type}
                      occasion={`rite:${game.code}:${r.epoch}:${own.type}`}
                    />
                  </>
                )}
                {own.type === 'board' && (
                  <Escape puzzle={own} send={send} busy={busy || !online} />
                )}
                {own.type === 'lab' && (
                  <Laboratory
                    key={own.turn ?? own.vote?.id ?? own.phase}
                    puzzle={own}
                    send={send}
                    busy={busy || !online}
                  />
                )}
                {own.type === 'grid' && (
                  <Sphinx
                    key={r.epoch}
                    puzzle={own}
                    send={send}
                    busy={busy || !online}
                  />
                )}
                {own.type === 'ritual' && (
                  <Divination
                    key={JSON.stringify(own.altar)}
                    puzzle={own}
                    send={send}
                    busy={busy || !online}
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
