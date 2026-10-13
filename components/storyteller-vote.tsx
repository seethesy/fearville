'use client';
import { useTableActions, useTableOnline } from '@/hooks/use-table-actions';
import { useState } from 'react';
import { VoteChoices } from './vote-choices';
export function StorytellerVote({
  player,
  name,
  ballot,
  vote,
  version,
  completed,
  refresh,
}: {
  player: string;
  name: string;
  ballot: string;
  vote: boolean | null | undefined;
  version: number;
  completed: boolean;
  refresh: () => Promise<void>;
}) {
  const actionFetch = useTableActions();
  const online = useTableOnline();
  const [pendingAction, setBusy] = useState(false);
  const busy = pendingAction || !online;
  const [error, setError] = useState('');
  return (
    <span>
      <VoteChoices
        label={`Change vote for ${name}`}
        disabled={busy}
        value={vote === undefined ? '' : String(vote)}
        onChange={async (yes) => {
          setBusy(true);
          setError('');
          try {
            const r = await actionFetch('/api/game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: completed ? 'correctVote' : 'vote',
                player,
                ballot,
                yes,
                version,
              }),
            });
            const d = (await r.json()) as { error?: string };
            if (!r.ok) throw Error(d.error || 'Unable to change vote.');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Try again.');
          } finally {
            await refresh();
            setBusy(false);
          }
        }}
      />
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </span>
  );
}
