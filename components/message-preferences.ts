'use client';
import { useCallback, useEffect, useState } from 'react';
type Prefs = { read: string[]; pins: string[] };
function readPrefs(key: string): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? '{}');
    return {
      read: Array.isArray(p.read) ? p.read : [],
      pins: Array.isArray(p.pins) ? p.pins : [],
    };
  } catch {
    return { read: [], pins: [] };
  }
}
export function useMessagePreferences(code: string, me: string) {
  const key = `fearville-messages:${code}:${me}`;
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(key));
  useEffect(() => {
    const sync = () => setPrefs(readPrefs(key));
    window.addEventListener('storage', sync);
    window.addEventListener('fearville-messages', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('fearville-messages', sync);
    };
  }, [key]);
  const update = useCallback(
    (change: (old: Prefs) => Prefs) => {
      const next = change(readPrefs(key));
      setPrefs(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
        window.dispatchEvent(new Event('fearville-messages'));
      } catch {
        /* In-memory fallback. */
      }
    },
    [key],
  );
  return { prefs, update };
}
