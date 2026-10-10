'use client';
import { useEffect, useId, useState } from 'react';
import { useAccount, accountAction } from './hub/account-context';

const guestKey = (session: string) => `fearville:role-tips:${session}`;
const openKey = (session: string) => `fearville:role-tips-open:${session}`;

export function useRoleTipsSetting(session: string) {
  const { state, preferences, preview } = useAccount();
  const [guestEnabled, setGuestEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const account = !!state?.account;
  useEffect(() => {
    if (account) return;
    const key = guestKey(session);
    const read = () => {
      try {
        setGuestEnabled(localStorage.getItem(key) !== 'false');
      } catch {
        setGuestEnabled(true);
      }
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; enabled: boolean }>)
        .detail;
      if (detail?.key === key) setGuestEnabled(detail.enabled);
    };
    read();
    window.addEventListener('fearville:role-tips-changed', changed);
    return () =>
      window.removeEventListener('fearville:role-tips-changed', changed);
  }, [account, session]);
  const enabled = account ? preferences.showTips : guestEnabled;
  async function setEnabled(next: boolean) {
    if (busy) return;
    setError('');
    if (!account) {
      setGuestEnabled(next);
      try {
        localStorage.setItem(guestKey(session), String(next));
      } catch {
        /* storage is optional */
      }
      window.dispatchEvent(
        new CustomEvent('fearville:role-tips-changed', {
          detail: { key: guestKey(session), enabled: next },
        }),
      );
      return;
    }
    setBusy(true);
    preview({ ...preferences, showTips: next });
    try {
      await accountAction({ action: 'roleTips', enabled: next });
    } catch (e) {
      preview({ ...preferences, showTips: enabled });
      setError(e instanceof Error ? e.message : 'Could not save tips setting.');
    } finally {
      setBusy(false);
    }
  }
  return { enabled, setEnabled, busy, error };
}

export function RoleTipsToggle({ session }: { session: string }) {
  const { enabled, setEnabled, busy, error } = useRoleTipsSetting(session);
  return (
    <div>
      <label className="check-setting">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void setEnabled(event.target.checked)}
        />
        <span>Show role tips</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function RoleTipsPanel({
  tips,
  session,
}: {
  tips: string[];
  session: string;
}) {
  const { enabled, setEnabled, busy, error } = useRoleTipsSetting(session);
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(openKey(session)) === 'true');
    } catch {
      setOpen(false);
    }
  }, [session]);
  if (!tips.length) return null;
  return (
    <section className="panel role-tips-panel" aria-label="Role tips">
      <div className="role-tips-header">
        <button
          type="button"
          className="secondary"
          aria-expanded={enabled && open}
          aria-controls={id}
          disabled={!enabled}
          onClick={() => {
            const next = !open;
            setOpen(next);
            try {
              localStorage.setItem(openKey(session), String(next));
            } catch {
              /* storage is optional */
            }
          }}
        >
          Tips {enabled && open ? '−' : '+'}
        </button>
        <label className="check-setting">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => void setEnabled(event.target.checked)}
          />
          <span>Show tips</span>
        </label>
      </div>
      <div id={id} hidden={!enabled || !open}>
        <ul>
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
