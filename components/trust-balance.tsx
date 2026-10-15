'use client';
import { useEffect, useState } from 'react';
import AppLink from '@/components/app-link';
import { useText } from '@/components/ui-text';
import { useAccount } from '@/components/hub/account-context';
export function TrustBalance({ accountId }: { accountId?: string | null }) {
  const { state } = useAccount();
  const id = accountId === undefined ? state?.account?.id : accountId;
  const text = useText();
  const [wallet, setWallet] = useState<{
    account: string;
    balance: number;
  } | null>(null);
  const [notice, setNotice] = useState<{
    account: string;
    amount: number;
  } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    let lastEntry: number | null = null;
    const refresh = () => {
      if (document.hidden) return;
      void fetch('/api/wallet', { cache: 'no-store' })
        .then(async (r) => {
          if (r.ok) {
            const data = (await r.json()) as {
              balance: number;
              entries: { id: number; amount: number; reason: string }[];
            };
            if (live) {
              setWallet({ account: id, balance: data.balance });
              const earned =
                lastEntry === null
                  ? 0
                  : data.entries
                      .filter((e) => e.id > lastEntry! && e.reason === 'rating')
                      .reduce((sum, e) => sum + e.amount, 0);
              if (earned > 0) setNotice({ account: id, amount: earned });
              lastEntry = Math.max(
                lastEntry ?? 0,
                ...data.entries.map((e) => e.id),
              );
            }
          }
        })
        .catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('trust-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('trust-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [id]);
  if (!id) return <p className="hint">{text('wallet.guest')}</p>;
  return (
    <span>
      <AppLink href="/wallet" className="quiet-link" aria-live="polite">
        {wallet?.account === id
          ? text('wallet.balance', { amount: wallet.balance })
          : text('wallet.title')}
      </AppLink>
      {notice?.account === id && (
        <output>
          {text('wallet.ratingEarned', { amount: notice.amount })}
        </output>
      )}
    </span>
  );
}
