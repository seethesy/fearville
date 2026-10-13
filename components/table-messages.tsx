'use client';
import { GlossaryText } from '@/components/glossary-text';
import { useEffect, useRef, useState } from 'react';
import { useMessagePreferences } from './message-preferences';
import { role } from '@/lib/game/types';
import type { GameView } from '@/lib/game/view';
import { ReportDialog } from '@/components/social/report-dialog';
import { useAccount } from '@/components/hub/account-context';
import { useOlderFeed } from '@/hooks/use-older-feed';
import { timedActionFetch } from '@/lib/game/action-timing';

export function TableMessages({
  game,
  recipient,
  onRecipient,
  online,
  refresh,
  active,
}: {
  game: GameView;
  recipient: string;
  onRecipient: (id: string) => void;
  online: boolean;
  refresh: () => Promise<void>;
  active: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const { prefs, update } = useMessagePreferences(game.code, game.me);
  const retry = useRef<{ to: string; text: string; id: string } | null>(null);
  const feed = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [thread, setThread] = useState<'host' | 'channel'>('host');
  const [reporting, setReporting] = useState<{
    id: string;
    from: string;
  } | null>(null);
  const { state: account } = useAccount();
  const older = useOlderFeed<GameView['messages'][number]>(
    'messages',
    game.feeds?.messages ?? null,
    game.sandboxHost && !game.host ? game.me : undefined,
    `${game.phase}:${game.channel?.id ?? ''}`,
  );
  const inChannel = !game.host && thread === 'channel' && !!game.channel;
  const to = game.host ? recipient : inChannel ? 'channel' : 'host';
  const player = game.players.find((p) => p.id === to);
  const title =
    to === 'all'
      ? 'Announcements to everyone'
      : game.host
        ? (player?.name ?? 'Choose a player')
        : inChannel
          ? `Channel with ${game.channel!.with}`
          : 'Storyteller';
  const combined = [...older.items, ...game.messages].filter((m) => !(m.kind==='chat' && game.blockedChatSenders?.includes(m.from)))
    .filter((m) => !m.to.startsWith('channel:') ||
    (game.phase==='night' && (game.host || m.to==='channel:'+game.channel?.id))).filter(
    (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
  );
  const messages = combined.filter((m) =>
    game.host
      ? to === 'all'
        ? m.to === 'all'
        : m.to === to || m.from === to
      : inChannel === m.to.startsWith('channel:'),
  );
  const sender = (id: string) =>
    game.players.find((p) => p.id === id)?.name ?? 'Storyteller';
  const last = messages.at(-1)?.id;
  useEffect(() => {
    if (!active) return;
    const mark = () => {
      if (document.hidden) return;
      const unread = messages
        .filter((m) => m.from !== game.me && !prefs.read.includes(m.id))
        .map((m) => m.id);
      if (unread.length)
        update((old) => ({
          ...old,
          read: [...new Set([...old.read, ...unread])],
        }));
    };
    const frame = requestAnimationFrame(mark);
    document.addEventListener('visibilitychange', mark);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [active, to, last, messages, game.me, prefs.read, update]);
  useEffect(() => {
    nearBottom.current = true;
    if (feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [to, active]);
  useEffect(() => {
    if (nearBottom.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [last]);
  async function send() {
    const text = (drafts[to] ?? '').trim();
    if (!text || sending || !online) return;
    setSending(true);
    setError('');
    const pending =
      retry.current?.to === to && retry.current.text === text
        ? retry.current
        : { to, text, id: crypto.randomUUID() };
    retry.current = pending;
    try {
      const r = await timedActionFetch('/api/game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          to,
          text,
          messageId: pending.id,
        }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(data.error || 'Message was not sent. Try again.');
      retry.current = null;
      setDrafts((old) => ({ ...old, [to]: '' }));
      nearBottom.current = true;
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not send. Your draft is saved; try again.',
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <div
      className={`conversation-layout ${game.host ? '' : 'single-conversation'}`}
    >
      {game.host && (
        <nav className="conversation-list" aria-label="Player conversations">
          <h2>Messages</h2>
          {[
            { id: 'all', name: 'Everyone', departed: false, role: '' },
            ...game.players,
          ]
            .sort((a, b) => {
              const pin =
                Number(prefs.pins.includes(b.id)) -
                Number(prefs.pins.includes(a.id));
              if (pin) return pin;
              const recent = (id: string) =>
                game.messages
                  .filter((m) =>
                    id === 'all'
                      ? m.to === 'all'
                      : m.to === id || m.from === id,
                  )
                  .at(-1)?.at ?? 0;
              return recent(b.id) - recent(a.id);
            })
            .map((p) => {
              const latest = game.messages
                .filter((m) =>
                  p.id === 'all'
                    ? m.to === 'all'
                    : m.to === p.id || m.from === p.id,
                )
                .at(-1);
              const unread = game.messages.filter(
                (m) => m.from === p.id && !prefs.read.includes(m.id),
              ).length;
              return (
                <div className="conversation-row" key={p.id}>
                  <button
                    className={to === p.id ? 'selected' : ''}
                    aria-current={to === p.id ? 'true' : undefined}
                    onClick={() => {
                      onRecipient(p.id);
                      setError('');
                    }}
                  >
                    <strong>
                      {p.name}
                      {p.role && (
                        <small className="conversation-role">
                          ({role(p.role)?.name})
                        </small>
                      )}
                      {p.departed ? ' · Left' : ''}
                      {unread > 0 && (
                        <small className="unread-count">{unread} new</small>
                      )}
                    </strong>
                    <span>
                      {latest?.text ??
                        (p.id === 'all'
                          ? 'Public announcements'
                          : 'Start a private conversation')}
                    </span>
                  </button>
                  <button
                    className="pin-conversation"
                    aria-label={`${prefs.pins.includes(p.id) ? 'Unpin' : 'Pin'} conversation with ${p.name}`}
                    aria-pressed={prefs.pins.includes(p.id)}
                    onClick={() =>
                      update((old) => ({
                        ...old,
                        pins: old.pins.includes(p.id)
                          ? old.pins.filter((id) => id !== p.id)
                          : [...old.pins, p.id],
                      }))
                    }
                  >
                    {prefs.pins.includes(p.id) ? 'Unpin' : 'Pin'}
                  </button>
                </div>
              );
            })}
        </nav>
      )}
      <section className="conversation" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <p className="hint">
            Session messages are revealed to everyone in the recap after the
            game ends.
          </p>
          <p className="muted">
            {to === 'all'
              ? 'Messages here are visible to every player.'
              : inChannel
                ? 'The Medium’s channel · closes at dawn'
                : 'Private conversation · updates automatically'}
          </p>
          {!game.host && game.channel && (
            <fieldset className="short-choices" aria-label="Conversation">
              <button
                type="button"
                className="secondary"
                aria-pressed={!inChannel}
                onClick={() => setThread('host')}
              >
                Storyteller
              </button>
              <button
                type="button"
                className="secondary"
                aria-pressed={inChannel}
                onClick={() => setThread('channel')}
              >
                Channel with {game.channel.with}
              </button>
            </fieldset>
          )}
        </header>
        <div
          className="conversation-feed"
          ref={feed}
          role="log"
          aria-label="Conversation messages"
          aria-live={active ? 'polite' : 'off'}
          onScroll={() => {
            const el = feed.current;
            if (el)
              nearBottom.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {older.before && (
            <button
              className="secondary"
              disabled={older.busy}
              onClick={() => void older.load()}
            >
              {older.busy ? 'Loading…' : 'Load older messages'}
            </button>
          )}
          {older.error && (
            <p className="error" role="alert">
              {older.error}
            </p>
          )}
          {!messages.length && (
            <p className="muted">
              No messages yet. Say hello or send instructions below.
            </p>
          )}
          {messages.map((m) => (
            <article
              key={m.id}
              className={`chat-bubble ${m.from === game.me ? 'outgoing' : 'incoming'} ${m.kind !== 'chat' ? 'system-message' : ''}`}
            >
              <small>
                {m.to.startsWith('channel:')
                  ? m.from === game.me
                    ? 'You · Medium channel'
                    : sender(m.from) + ' · Medium channel'
                  : m.to === 'all'
                    ? 'Announcement'
                    : m.kind === 'correction'
                      ? 'Correction'
                      : m.kind === 'info'
                        ? 'Character information'
                        : m.from === game.me
                          ? 'You'
                          : game.host
                            ? player?.name
                            : 'Storyteller'}
              </small>
              <p>
                {m.kind === 'info' ? <GlossaryText text={m.text} /> : m.text}
              </p>
              <time dateTime={new Date(m.at).toISOString()}>
                {new Date(m.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {m.kind === 'chat' && m.from !== game.me && (
                <button
                  type="button"
                  className="quiet-link message-report"
                  onClick={() => setReporting({ id: m.id, from: m.from })}
                >
                  Report
                </button>
              )}
            </article>
          ))}
        </div>
        <form
          className="message-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {player?.departed ? (
            <p className="muted">
              This player has left. Their conversation is kept for reference.
            </p>
          ) : (
            <>
              <label className="field">
                {to === 'all' ? 'Announcement' : `Message ${title}`}
                <textarea
                  aria-label={
                    to === 'all' ? 'Announcement' : `Message ${title}`
                  }
                  rows={3}
                  maxLength={4000}
                  value={drafts[to] ?? ''}
                  disabled={sending}
                  placeholder="Write a message…"
                  onChange={(e) =>
                    setDrafts((old) => ({ ...old, [to]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
              </label>
              <div className="composer-actions">
                <small>
                  {online
                    ? 'Enter to send · Shift+Enter for a new line'
                    : 'Reconnecting — your draft is kept.'}
                </small>
                <button
                  className="primary"
                  disabled={sending || !online || !(drafts[to] ?? '').trim()}
                >
                  {sending
                    ? 'Sending…'
                    : to === 'all'
                      ? 'Send to everyone'
                      : 'Send'}
                </button>
              </div>
            </>
          )}
        </form>
      </section>
      {reporting && (
        <ReportDialog
          open
          onOpenChange={(open) => !open && setReporting(null)}
          title="Report this message"
          target={{ kind: 'chat', messageId: reporting.id }}
          onBlock={
            account?.account
              ? async () => {
                  const r = await fetch('/api/social', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'blockSeat',
                      code: game.code,
                      player: reporting.from,
                    }),
                  });
                  const data = (await r.json()) as { error?: string };
                  if (!r.ok) throw Error(data.error || 'Unable to block.');
                  await refresh();
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

