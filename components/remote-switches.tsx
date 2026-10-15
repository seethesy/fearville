'use client';
// FEAR-122: client view of remote switches. One shared poll (about 30 s, plus
// on focus/resume) feeds the maintenance banner and setup screens. The server
// enforces every switch; this only keeps the UI honest.
import { useEffect, useSyncExternalStore } from 'react';
import { publicEnabled, type PublicFlags } from '@/lib/flags/catalog';

const POLL_MS = 30_000;
let current: PublicFlags | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

async function refresh() {
  try {
    const r = await fetch('/api/flags', { cache: 'no-store' });
    if (!r.ok) return;
    const next = (await r.json()) as PublicFlags;
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    current = next;
    listeners.forEach((l) => l());
  } catch {
    /* Offline: keep the last known switches. */
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    }
  };
}

/** Public switches, or null until the first load. */
export function useRemoteSwitches() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
/** Whether a switch is on (true until switches load). */
export function useSwitch(key: string) {
  return publicEnabled(useRemoteSwitches(), key);
}

export function MaintenanceBanner() {
  const flags = useRemoteSwitches();
  const banner = flags?.maintenance;
  useEffect(() => {
    document.documentElement.toggleAttribute('data-maintenance', !!banner);
  }, [banner]);
  if (!banner) return null;
  return (
    <div
      className={`maintenance-banner maintenance-${banner.severity}`}
      role={banner.severity === 'critical' ? 'alert' : 'status'}
    >
      <span>{banner.text}</span>
      {banner.newGamesDisabled && (
        <span className="maintenance-note"> New games are paused.</span>
      )}
    </div>
  );
}
