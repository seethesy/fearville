'use client';
import AppLink from '@/components/app-link';
import { useState } from 'react';
import type { GameView } from '@/lib/game/view';
import { Home, LogOut } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
export function LobbyExit({ game }: { game: GameView }) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const canExit =
    game.phase === 'lobby' || (!game.host && game.phase === 'ended');
  async function leave() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: game.host ? 'deleteLobby' : 'leaveLobby',
        }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Unable to leave.');
      location.assign('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to leave.');
      setBusy(false);
    }
  }
  return (
    <div className="lobby-exits">
      <AppLink className="secondary" href="/">
        <Home size={16} />
        Return home <small>(keep lobby)</small>
      </AppLink>
      {canExit && (
        <button className="danger" onClick={() => setConfirm(true)}>
          <LogOut size={16} />
          {game.host ? 'Close lobby for everyone' : 'Leave lobby'}
        </button>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {game.host
                ? 'Close this lobby for everyone?'
                : 'Leave this lobby?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {game.host
                ? 'This removes the lobby and ends everyone’s access. Completed games stay in account history. To keep the lobby, cancel and choose Return home.'
                : 'Your seat and access will be removed. You can join again while the lobby is open. To keep your seat, cancel and choose Return home.'}
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
              onClick={() => void leave()}
            >
              {busy ? 'Closing…' : game.host ? 'Close lobby' : 'Leave lobby'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
