'use client';
import { useOlderFeed } from '@/hooks/use-older-feed';
import type { GameView } from '@/lib/game/view';
import type { Control } from '@/lib/game/types';
export function TableHistory({ game, open }: { game: GameView; open: (control: Control) => void }) {
  const log = useOlderFeed<GameView['log'][number]>('log', game.feeds?.log ?? null);
  const history = useOlderFeed<{ id: string; at: number; text: string }>('history', game.feeds?.history ?? null);
  const entries = [...log.items, ...game.log].filter((item, i, all) => all.findIndex((x) => x.id === item.id) === i);
  const rewind = game.controls.find((c) => c.action === 'rewind');
  return <section className="panel">
    <p className="eyebrow">DECISION HISTORY</p>
    {log.before && <button className="secondary" disabled={log.busy} onClick={() => void log.load()}>Load older history</button>}
    {history.before && <button className="secondary" disabled={history.busy} onClick={() => void history.load()}>Load earlier decisions</button>}
    {(log.error || history.error) && <p className="error" role="alert">{log.error || history.error}</p>}
    {rewind && history.items.slice().reverse().map((entry) => <article className="log-entry" key={entry.id}>
      <small>{new Date(entry.at).toLocaleTimeString()}</small><p>{entry.text}</p>
      <button className="secondary" onClick={() => open({ ...rewind, fields: [{ key: 'history', label: 'Restore state before', type: 'select', value: entry.id,
        options: [{ value: entry.id, label: entry.text }] }] })}>Revert to this decision</button>
    </article>)}
    {entries.slice().reverse().map((entry) => <article className="log-entry" key={entry.id}>
      <small>{new Date(entry.at).toLocaleTimeString()}</small><p>{entry.text}</p>
    </article>)}
  </section>;
}
