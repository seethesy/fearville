'use client';
// Report a player, chat message or rating comment (FEAR-119), with an
// optional Block action. Reports go to the moderation queue.
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export type ReportTarget =
  | { kind: 'player'; handle: string }
  | { kind: 'chat'; messageId: string }
  | { kind: 'rating'; ref: string };

const REASONS: [string, string][] = [
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate speech'],
  ['sexual', 'Sexual content'],
  ['spam', 'Spam'],
  ['cheating', 'Cheating'],
  ['other', 'Something else'],
];

export function ReportDialog({
  open,
  onOpenChange,
  title,
  target,
  onBlock,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  target: ReportTarget;
  onBlock?: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  function change(next: boolean) {
    if (!next) {
      setReason('');
      setNote('');
      setError('');
      setDone('');
    }
    onOpenChange(next);
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, reason, note }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(data.error || 'Unable to send the report.');
      setDone(
        'Thanks. Your report was sent and will be reviewed within 24 hours.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send the report.');
    } finally {
      setBusy(false);
    }
  }
  async function block() {
    if (!onBlock) return;
    setBusy(true);
    setError('');
    try {
      await onBlock();
      setDone('Blocked. You won’t see their messages or requests.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to block this player.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            Reports are private. The reported player isn’t told who reported
            them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {done ? (
          <output>{done}</output>
        ) : (
          <>
            <label className="field">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="" disabled>
                  Choose a reason
                </option>
                {REASONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Note (optional)
              <textarea
                value={note}
                maxLength={500}
                rows={3}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {done ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!done && onBlock && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void block()}
            >
              Block player
            </button>
          )}
          {!done && (
            <button
              className="danger"
              disabled={busy || !reason}
              onClick={() => void submit()}
            >
              Send report
            </button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
