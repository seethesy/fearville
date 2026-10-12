'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAccount, accountAction } from '@/components/hub/account-context';
import { keepScreenAwake } from '@/lib/native/keep-awake';

const GUEST_KEY = 'fearville:keep-awake';
const CHANGED = 'fearville:keep-awake-changed';
let guestFallback = true;

function readGuestSetting() {
  try {
    return localStorage.getItem(GUEST_KEY) === null
      ? guestFallback
      : localStorage.getItem(GUEST_KEY) !== 'false';
  } catch {
    return guestFallback;
  }
}

function subscribeGuestSetting(changed: () => void) {
  window.addEventListener(CHANGED, changed);
  window.addEventListener('storage', changed);
  return () => {
    window.removeEventListener(CHANGED, changed);
    window.removeEventListener('storage', changed);
  };
}

/** Keep the screen on while `active` (seated at a table) is true. */
export function useKeepAwake(active: boolean) {
  useEffect(() => (active ? keepScreenAwake() : undefined), [active]);
}

/**
 * The personal "Keep screen awake during games" setting (default on):
 * saved with account preferences, or in this browser for guests.
 */
export function useKeepAwakeSetting() {
  const { state, preferences, preview } = useAccount();
  const account = !!state?.account;
  const guestEnabled = useSyncExternalStore(subscribeGuestSetting, readGuestSetting, () => true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enabled = account ? preferences.keepAwake : guestEnabled;
  async function setEnabled(next: boolean) {
    if (busy) return;
    setError('');
    if (!account) {
      guestFallback = next;
      try {
        localStorage.setItem(GUEST_KEY, String(next));
      } catch {
        /* storage is optional */
      }
      window.dispatchEvent(new Event(CHANGED));
      return;
    }
    const previous = preferences;
    setBusy(true);
    preview({ ...preferences, keepAwake: next });
    try {
      await accountAction({ action: 'preferences', settings: { ...preferences, keepAwake: next } });
    } catch (e) {
      preview(previous);
      setError(e instanceof Error ? e.message : 'Could not save this setting.');
    } finally {
      setBusy(false);
    }
  }
  return { enabled, setEnabled, busy, error };
}
