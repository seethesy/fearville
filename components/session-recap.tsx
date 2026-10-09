'use client';
import { useEffect, useState } from 'react';
import { ChevronRight, Crown } from 'lucide-react';
import type { GameView } from '@/lib/game/view';
import { ALL_ROLES, SCRIPTS, type Team } from '@/lib/game/types';
import { PlayerAvatar } from './player-avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';

type Recap = GameView['recaps'][number];
type RecapPlayer = Recap['players'][number];
const colors: Record<Team, string> = {
  minion: '#F79D36',
  demon: '#900D09',
  townsfolk: '#0B6623',
  outsider: '#1E90FF',
};
function roleColor(p: RecapPlayer) {
  return colors[
    p.team ?? ALL_ROLES.find((r) => r.name === p.role)?.team ?? 'townsfolk'
  ];
}
export function gameDuration(recap: Recap) {
  if (recap.started === undefined) return 'Duration unavailable';
  const seconds = Math.max(0, Math.floor((recap.ended - recap.started) / 1000));
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}h ${minutes}m ${seconds % 60}s`
    : `${minutes}m ${seconds % 60}s`;
}

export function GameEndPopup({
  game,
  refresh,
  onReturn,
}: {
  game: GameView;
  refresh: () => Promise<void>;
  onReturn: () => void;
}) {
  const recap = game.recaps.at(-1);
  const key = recap ? `fearville-recap-dismissed:${recap.id}:${game.me}` : '';
  const [dismissed, setDismissed] = useState('');
  const [ready, setReady] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (sessionStorage.getItem(key)) setDismissed(key);
      } catch {
        /* In-memory dismissal still works. */
      }
      setReady(key);
    });
    return () => cancelAnimationFrame(frame);
  }, [key]);
  if (!recap || (!game.host && !recap.players.some((p) => p.id === game.me)))
    return null;
  const open =
    ready === key &&
    dismissed !== key &&
    ['ended', 'lobby'].includes(game.phase);
  const limit = game.host ? 3 : 1;
  function dismiss() {
    setDismissed(key);
    try {
      sessionStorage.setItem(key, 'yes');
    } catch {
      /* Optional persistence. */
    }
  }
  async function act(
    action: 'mvpVote' | 'returnLobby' | 'leaveLobby',
    player?: string,
  ) {
    setBusy(true);
    setError('');
    try {
      const leaving = action === 'leaveLobby';
      const response = await fetch(leaving ? '/api/session' : '/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: leaving && game.host ? 'leave' : action,
          player,
          recap: recap!.id,
          version: game.version,
          ...(game.sandboxHost && !game.host ? { pov: game.me } : {}),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error || 'Unable to save. Try again.');
      if (leaving) {
        dismiss();
        location.assign('/');
        return;
      }
      if (action === 'returnLobby') {
        dismiss();
        onReturn();
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="action-dialog mvp-dialog"
        showCloseButton={false}
      >
        <DialogHeader>
          <div className="recap-heading">
            <DialogTitle>{recap.winner} wins</DialogTitle>
            <span aria-label="Game duration">{gameDuration(recap)}</span>
          </div>
          <DialogDescription>
            Choose your MVP{game.host ? 's' : ''}.{' '}
            {limit - recap.myVotes.length} of {limit} votes remaining.{' '}
            {game.host
              ? 'Choose three different players.'
              : 'You cannot vote for yourself.'}{' '}
            Votes are final.
          </DialogDescription>
          {recap.myReward && (
            <p className="recap-rewards">
              <strong>
                {recap.myReward.xp.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{' '}
                XP
              </strong>
              {' · '}
              {recap.myReward.baseXp} from playing
              {recap.myReward.mvpXp > 0
                ? ` + ${recap.myReward.mvpXp.toLocaleString(undefined, { maximumFractionDigits: 2 })} MVP bonus`
                : ''}
              {recap.myReward.eloDelta !== null && (
                <>
                  {' '}
                  · Elo{' '}
                  <strong>
                    {recap.myReward.eloDelta >= 0 ? '+' : ''}
                    {recap.myReward.eloDelta}
                  </strong>
                </>
              )}
              <small className="hint">
                MVP bonus updates as votes arrive.
                {!recap.myReward.saved &&
                  ' Save this seat to your account to keep your XP.'}
              </small>
            </p>
          )}
        </DialogHeader>
        <div className="mvp-list" aria-label="MVP candidates">
          {recap.players.map((p) => (
            <button
              key={p.id}
              className="mvp-candidate"
              disabled={
                busy ||
                recap.myVotes.length >= limit ||
                recap.myVotes.includes(p.id) ||
                (!game.host && p.id === game.me)
              }
              onClick={() => void act('mvpVote', p.id)}
              aria-pressed={recap.myVotes.includes(p.id)}
            >
              <PlayerAvatar
                avatar={p.avatar}
                id={p.id}
                frame={p.portraitFrame}
              />
              <span className="mvp-identity">
                <strong>
                  {p.name}
                  {p.id === game.me ? ' · you' : ''}
                </strong>
                <small style={{ color: roleColor(p) }}>
                  {p.role || 'Unassigned'}
                </small>
              </span>
              <span className="mvp-status">
                {recap.myVotes.includes(p.id) && (
                  <Crown size={17} aria-label="Your MVP vote" />
                )}
                {p.alive === false ? 'Dead' : 'Alive'}
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="mvp-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act('leaveLobby')}
          >
            Leave Lobby
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void act('returnLobby')}
          >
            Return to Lobby
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlayerDetails({
  recap,
  player,
}: {
  recap: Recap;
  player: RecapPlayer;
}) {
  const history = recap.decisions.filter((d) =>
    d.playerIds
      ? d.playerIds.includes(player.id)
      : d.actor === player.name || d.text.includes(player.name),
  );
  const messages = (recap.messages ?? []).filter(
    (m) =>
      m.from === player.id ||
      m.to === player.id ||
      m.to === 'all' ||
      m.participants?.includes(player.id) ||
      (m.to.startsWith('channel:') &&
        (recap.messages ?? []).some(
          (q) => q.to === m.to && q.from === player.id,
        )),
  );
  const name = (id: string) =>
    id === 'host'
      ? 'Storyteller'
      : id === 'all'
        ? 'Everyone'
        : id.startsWith('channel:')
          ? 'Medium channel'
          : (recap.players.find((p) => p.id === id)?.name ?? id);
  return (
    <Tabs defaultValue="history" className="recap-detail-tabs">
      <TabsList aria-label="Player recap">
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="messages">Messages</TabsTrigger>
      </TabsList>
      <TabsContent value="history">
        <ol className="recap-history">
          {history.map((d) => (
            <li key={d.id}>
              <small>
                {new Date(d.at).toLocaleTimeString()} · {d.actor}
              </small>
              <p>{d.text}</p>
            </li>
          ))}
        </ol>
        {!history.length && <p>No recorded activity for this player.</p>}
      </TabsContent>
      <TabsContent value="notes">
        {player.notebook ? (
          <>
            <p className="preserve-lines">
              {player.notebook.text || 'No written notes.'}
            </p>
            {Object.entries(player.notebook.roles).length > 0 && (
              <h3>Role notes</h3>
            )}
            {Object.entries(player.notebook.roles).map(([id, value]) => (
              <p key={id}>
                {ALL_ROLES.find((r) => r.id === id)?.name ?? id}:{' '}
                {['Ruled out', 'Possible', 'In play'][value]}
              </p>
            ))}
            {Object.entries(player.notebook.players).length > 0 && (
              <h3>Player guesses</h3>
            )}
            {Object.entries(player.notebook.players).map(([id, value]) => (
              <p key={id}>
                {name(id)}:{' '}
                {ALL_ROLES.find((r) => r.id === value.role)?.name ?? 'Unknown'}{' '}
                {value.confidence && `· ${value.confidence}`}
              </p>
            ))}
          </>
        ) : (
          <p>No notes were saved for this session.</p>
        )}
      </TabsContent>
      <TabsContent value="messages">
        {messages.map((m) => (
          <article className="message" key={m.id}>
            <small>
              {name(m.from)} → {name(m.to)} ·{' '}
              {new Date(m.at).toLocaleTimeString()}
            </small>
            <p className="preserve-lines">{m.text}</p>
          </article>
        ))}
        {!messages.length && <p>No messages for this player.</p>}
      </TabsContent>
    </Tabs>
  );
}

export function SessionRecaps({ game }: { game: GameView }) {
  const [selected, setSelected] = useState<{
    recap: string;
    player: string;
  } | null>(null);
  const recap = game.recaps.find((r) => r.id === selected?.recap);
  const player = recap?.players.find((p) => p.id === selected?.player);
  return (
    <section className="session-recaps">
      {!game.recaps.length && (
        <div className="panel">
          <h2>Session Recap</h2>
          <p>Your completed games will appear here.</p>
        </div>
      )}
      {game.recaps.map((r, index) => {
        const mine = r.players.find((p) => p.id === game.me);
        return (
          <details className="panel session-recap" key={r.id}>
            <summary>
              <ChevronRight className="recap-arrow" size={20} />
              <strong>Session {r.number ?? index + 1}</strong>
              <span style={{ color: mine ? roleColor(mine) : undefined }}>
                {game.host
                  ? 'Storyteller'
                  : (mine?.role ?? 'Not in this session')}
              </span>
            </summary>
            <div className="recap-heading">
              <h3>{r.winner} wins</h3>
              <span>{gameDuration(r)}</span>
            </div>
            <p className="muted">{SCRIPTS[r.script]}</p>
            <div className="seat-circle-scroll">
              <div
                className="seat-circle recap-circle"
                style={{
                  minWidth: Math.max(520, r.players.length * 57),
                  minHeight: Math.max(500, r.players.length * 48),
                }}
              >
                <div className="circle-center">
                  Session {r.number ?? index + 1}
                  <br />
                  <small>Click a player to explore</small>
                </div>
                {r.players.map((p, i) => {
                  const angle =
                    (2 * Math.PI * i) / r.players.length - Math.PI / 2;
                  return (
                    <button
                      key={p.id}
                      className="circle-seat recap-seat"
                      style={{
                        left: `${50 + 37 * Math.cos(angle)}%`,
                        top: `${50 + 36 * Math.sin(angle)}%`,
                      }}
                      onClick={() => setSelected({ recap: r.id, player: p.id })}
                      aria-label={`View ${p.name}'s session recap`}
                    >
                      <small
                        className="recap-role"
                        style={{ color: roleColor(p) }}
                      >
                        {p.role || 'Unassigned'}
                      </small>
                      <PlayerAvatar
                        avatar={p.avatar}
                        id={p.id}
                        frame={p.portraitFrame}
                        dead={p.alive === false}
                      />
                      <span className="recap-player-name">
                        {p.name}
                        <span
                          className="mvp-count"
                          aria-label={`${r.mvpCounts[p.id] ?? 0} MVP votes`}
                        >
                          <Crown size={15} />
                          {r.mvpCounts[p.id] ?? 0}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        );
      })}
      <Dialog
        open={!!player}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="action-dialog recap-player-dialog">
          <DialogHeader>
            <DialogTitle>{player?.name}</DialogTitle>
            <DialogDescription>
              {player?.role} · Session{' '}
              {recap?.number ?? (recap ? game.recaps.indexOf(recap) + 1 : '')}
            </DialogDescription>
          </DialogHeader>
          {recap && player && (
            <PlayerDetails
              key={recap.id + player.id}
              recap={recap}
              player={player}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
