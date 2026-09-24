'use client';
import { useState } from 'react';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <span>
      <select
        aria-label={`Change vote for ${name}`}
        disabled={busy}
        value={vote === undefined ? '' : String(vote)}
        onChange={async (e) => {
          const yes = e.target.value;
          setBusy(true);
          setError('');
          try {
            const r = await fetch('/api/game', {
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
      >
        <option value="" disabled>
          Waiting
        </option>
        <option value="true">Yes</option>
        <option value="false">No</option>
        <option value="null">Abstain</option>
      </select>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </span>
  );
}
