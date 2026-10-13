'use client';
import type { ConnectionPhase } from '@/lib/game/socket-client';
export function TableConnectionBanner({
  phase,
  retry,
}: {
  phase: ConnectionPhase;
  retry: () => void;
}) {
  if (phase === 'live' || phase === 'connecting') return null;
  return (
    <output className="error" aria-live="polite">
      {phase === 'offline' ? (
        <>
          Offline.{' '}
          <button className="secondary" onClick={retry}>
            Retry
          </button>
        </>
      ) : (
        'Reconnecting…'
      )}
    </output>
  );
}
