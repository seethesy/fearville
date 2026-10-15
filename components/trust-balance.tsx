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
  useEffect(() => {
    if (!id) return;
    let live = true;
    const refresh = () => {
      if (document.hidden) return;
      void fetch('/api/wallet', { cache: 'no-store' })
        .then(async (r) => {
          if (r.ok) {
            const data = (await r.json()) as { balance: number };
            if (live) setWallet({ account: id, balance: data.balance });
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
    <AppLink href="/wallet" className="quiet-link" aria-live="polite">
      {wallet?.account === id
        ? text('wallet.balance', { amount: wallet.balance })
        : text('wallet.title')}
    </AppLink>
  );
}
