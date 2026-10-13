'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { AccountView } from '@/components/account-panel';
import {
  defaultPreferences,
  type Preferences,
} from '@/lib/accounts/preferences';
import { setAudioPreferences } from './audio';

export async function accountAction(body: Record<string, unknown>) {
  const r = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as AccountView & { error?: string };
  if (!r.ok) throw Error(data.error || 'Unable to update your account.');
  return data as AccountView;
}
const Context = createContext<{
  state: AccountView | null;
  error: string;
  refresh: () => Promise<void>;
  preferences: Preferences;
  preview: (settings: Preferences) => void;
}>({
  state: null,
  error: '',
  refresh: async () => {},
  preferences: defaultPreferences,
  preview: () => {},
});
export const useAccount = () => useContext(Context);
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccountView | null>(null);
  const [error, setError] = useState('');
  const [preferences, preview] = useState(defaultPreferences);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/accounts', { cache: 'no-store' });
      if (!r.ok) {
        const failure = (await r.json()) as { error?: string };
        throw Error(
          failure.error || 'Account service is unavailable. Please try again.',
        );
      }
      const data = (await r.json()) as AccountView;
      setState(data);
      setError('');
      preview(data.profile?.settings ?? defaultPreferences);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    document.documentElement.classList.toggle(
      'reduce-motion',
      preferences.reducedMotion,
    );
    document.documentElement.classList.toggle(
      'larger-text',
      preferences.largerText,
    );
    setAudioPreferences(preferences);
  }, [preferences]);
  const accountId = state?.account?.id;
  useEffect(() => {
    if (!accountId) return;
    const ping = () => {
      void fetch('/api/accounts/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: !document.hidden }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 45000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [accountId]);
  return (
    <Context.Provider value={{ state, error, refresh, preferences, preview }}>
      {children}
    </Context.Provider>
  );
}
