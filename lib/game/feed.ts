import type { Actor, Game } from './types.ts';

export const LIVE_FEED_LIMIT = 200;
export type FeedKind = 'messages' | 'log' | 'history';

// Filter before paging: counts and cursors must never describe somebody
// else's private conversation or the Storyteller's decisions.
export function visibleMessages(g: Game, a: Actor) {
  return g.messages.filter((m) => a.host ? true : m.to.startsWith('channel:')
    ? g.phase === 'night' && m.to === 'channel:' + g.hms?.channel?.id &&
      [g.hms?.channel?.a, g.hms?.channel?.b].includes(a.id)
    : m.to === 'all' || m.to === a.id || m.from === a.id);
}
export function feedPage(g: Game, a: Actor, kind: FeedKind, before?: string) {
  if (kind === 'history' && !a.host) throw Error('Only the Storyteller can read decisions.');
  const list = kind === 'messages' ? visibleMessages(g, a) : kind === 'log'
    ? g.log.filter((l) => a.host || l.public)
    : g.history.map(({ id, at, text }) => ({ id, at, text }));
  const end = before ? list.findIndex((item) => item.id === before) : list.length;
  if (end < 0) throw Error('This feed has changed. Refresh the table.');
  const start = Math.max(0, end - LIVE_FEED_LIMIT);
  const items = list.slice(start, end);
  return { items, before: start > 0 ? items[0]?.id ?? null : null };
}
