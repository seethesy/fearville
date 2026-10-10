'use client';
import { useState } from 'react';
import type { GameView } from '@/lib/game/view';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export function TableMembership({
  game,
  refresh,
  cosmetic = false,
}: {
  game: GameView;
  refresh: () => Promise<void>;
  cosmetic?: boolean;
}) {
  const current = game.host
    ? game.hostName
    : (game.players.find((p) => p.id === game.me)?.name ?? '');
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    action: string;
    player?: string;
    name?: string;
  } | null>(null);
  async function act(action: string, player?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, player, name }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to update the table.');
      if (
        action === 'leave' ||
        action === 'leaveLobby' ||
        action === 'deleteLobby'
      ) {
        location.assign('/');
        return;
      }
      setPending(null);
      setNotice(action === 'rename' ? 'Name updated.' : 'Player removed.');
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Connection failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel membership-panel">
      <h2>{cosmetic ? 'Lobby name' : 'Your seat & table'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act('rename');
        }}
      >
        <label className="field">
          Your name
          <input
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !name.trim() || name.trim() === current}
        >
          Save name
        </button>
      </form>
      {notice && <output>{notice}</output>}
      {error && !pending && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!cosmetic &&
        (game.host ? (
          <>
            <h3>Manage players</h3>
            {game.players
              .filter((p) => !p.departed)
              .map((p) => (
                <div className="membership-row" key={p.id}>
                  <span>{p.name}</span>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      setError('');
                      setPending({
                        action: 'remove',
                        player: p.id,
                        name: p.name,
                      });
                    }}
                  >
                    Remove {p.name}
                  </button>
                </div>
              ))}
            {game.phase === 'lobby' && (
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setPending({ action: 'deleteLobby' });
                }}
              >
                Delete lobby
              </button>
            )}
          </>
        ) : (
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              setError('');
              if (game.phase === 'lobby' || game.phase === 'ended')
                setPending({ action: 'leaveLobby' });
              else void act('leave');
            }}
          >
            {game.phase === 'lobby' || game.phase === 'ended'
              ? 'Leave lobby'
              : 'Leave table'}
          </button>
        ))}
      {!cosmetic && (
        <p className="hint">
          Return home keeps your seat and recovery key. Leave lobby removes your
          seat and access. During a game, Return home lets you rejoin later.
        </p>
      )}
      <AlertDialog
        open={!!pending}
        onOpenChange={(v) => {
          if (!v && !busy) setPending(null);
        }}
      >
        <AlertDialogContent className="action-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.action === 'deleteLobby'
                ? 'Delete this lobby?'
                : pending?.action === 'leave' ||
                    pending?.action === 'leaveLobby'
                  ? 'Leave this table?'
                  : `Remove ${pending?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === 'deleteLobby'
                ? 'This permanently deletes the lobby, conversations, and everyone’s access. This cannot be undone.'
                : `Access to this seat will end. ${game.phase === 'lobby' ? 'The seat will be removed from the lobby.' : 'The character stays in the game for the Storyteller to manage.'} Earlier game rewind points will be cleared.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (pending) void act(pending.action, pending.player);
              }}
            >
              {busy ? 'Updating…' : 'Confirm'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
