'use client';
import { ALL_ROLES } from '@/lib/game/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { type Recap, type RecapPlayer } from './shared.tsx';
export function PlayerDetails({
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
