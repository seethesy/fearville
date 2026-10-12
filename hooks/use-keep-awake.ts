'use client';
import { useEffect, useState } from 'react';
import { useAccount, accountAction } from '@/components/hub/account-context';
import { keepScreenAwake } from '@/lib/native/keep-awake';

const GUEST_KEY = 'fearville:keep-awake';
const CHANGED = 'fearville:keep-awake-changed';

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
  const [guestEnabled, setGuestEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (account) return;
    const read = () => {
      try {
        setGuestEnabled(localStorage.getItem(GUEST_KEY) !== 'false');
      } catch {
        setGuestEnabled(true);
      }
    };
    read();
    window.addEventListener(CHANGED, read);
    return () => window.removeEventListener(CHANGED, read);
  }, [account]);
  const enabled = account ? preferences.keepAwake : guestEnabled;
  async function setEnabled(next: boolean) {
    if (busy) return;
    setError('');
    if (!account) {
      setGuestEnabled(next);
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
