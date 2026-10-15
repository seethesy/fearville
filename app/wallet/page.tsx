'use client';
import { useEffect, useState } from 'react';
import { HubShell } from '@/components/hub/shell';
import { useAccount } from '@/components/hub/account-context';
import { AccountPanel } from '@/components/account-panel';
import { useText } from '@/components/ui-text';
import type { HistoryEntry, WalletFilter } from '@/lib/trust/history';
import './wallet.css';
type View = { balance: number; entries: HistoryEntry[]; cursor: string | null };
export default function Wallet() {
  const text = useText();
  const { state } = useAccount();
  const account = state?.account?.id;
  const [filter, setFilter] = useState<WalletFilter>('all');
  const [page, setPage] = useState<{
    account: string;
    filter: WalletFilter;
    view: View;
  } | null>(null);
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const view =
    page && page.account === account && page.filter === filter
      ? page.view
      : null;
  useEffect(() => {
    if (!account) return;
    let live = true;
    const refresh = () => {
      if (document.hidden) return;
      void fetch('/api/wallet?filter=' + filter, { cache: 'no-store' })
        .then(async (r) => {
          if (!r.ok) throw Error();
          const value = (await r.json()) as View;
          if (live) {
            setPage((old) => ({
              account,
              filter,
              view:
                old?.account === account &&
                old.filter === filter &&
                old.view.entries[0]?.id === value.entries[0]?.id
                  ? { ...old.view, balance: value.balance }
                  : value,
            }));
            setError(false);
          }
        })
        .catch(() => {
          if (live) setError(true);
        });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('trust-changed', refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('trust-changed', refresh);
    };
  }, [account, filter]);
  async function more() {
    if (!view?.cursor || busy || !account) return;
    setBusy(true);
    try {
      const r = await fetch(
        '/api/wallet?filter=' + filter + '&cursor=' + view.cursor,
        { cache: 'no-store' },
      );
      if (!r.ok) throw Error();
      const next = (await r.json()) as View;
      setPage((old) =>
        old?.account === account &&
        old.filter === filter &&
        old.view.cursor === view.cursor
          ? {
              account,
              filter,
              view: {
                ...next,
                entries: [...old.view.entries, ...next.entries],
              },
            }
          : old,
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  function description(e: HistoryEntry) {
    if (['refund', 'chargeback', 'admin', 'reversal'].includes(e.kind))
      return text('wallet.adjustment');
    if (e.reason === 'finish') return text('wallet.finish');
    if (e.reason === 'win') return text('wallet.win');
    if (e.reason === 'rating') return text('wallet.rating');
    if (e.kind === 'purchase')
      return text('wallet.purchase', { amount: e.amount });
    if (e.reason === 'cosmetic')
      return text('wallet.cosmetic', { item: e.item ?? text('wallet.item') });
    return text('wallet.adjustment');
  }
  return (
    <HubShell active="Account" title={text('wallet.title')}>
      {!account ? (
        <>
          <p>{text('wallet.guest')}</p>
          <AccountPanel />
        </>
      ) : (
        <section className="wallet-panel">
          <h2 aria-live="polite">
            {view
              ? text('wallet.balance', { amount: view.balance })
              : text('wallet.loading')}
          </h2>
          <label className="field">
            {text('wallet.filter')}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as WalletFilter)}
            >
              {(['all', 'earned', 'spent', 'purchased'] as const).map((f) => (
                <option key={f} value={f}>
                  {text('wallet.' + f)}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert">{text('wallet.error')}</p>}
          {view?.entries.length === 0 && <p>{text('wallet.empty')}</p>}
          <ol className="wallet-history">
            {view?.entries.map((e) => (
              <li key={e.id}>
                <time dateTime={new Date(e.created).toISOString()}>
                  {new Date(e.created).toLocaleString()}
                </time>
                <span>{description(e)}</span>
                <strong
                  aria-label={text(
                    e.amount > 0 ? 'wallet.credit' : 'wallet.debit',
                    { amount: Math.abs(e.amount) },
                  )}
                >
                  {e.amount > 0 ? '+' : '−'}
                  {Math.abs(e.amount)}
                </strong>
                <small>
                  {text('wallet.after', { amount: e.balance_after })}
                </small>
              </li>
            ))}
          </ol>
          {view?.cursor && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void more()}
            >
              {text('wallet.more')}
            </button>
          )}
        </section>
      )}
    </HubShell>
  );
}
