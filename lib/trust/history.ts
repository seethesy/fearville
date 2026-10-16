import { requireAccount } from './wallet.ts';
export type WalletFilter = 'all' | 'earned' | 'spent' | 'purchased';
export type HistoryEntry = {
  id: number;
  amount: number;
  balance_after: number;
  kind: string;
  reason: string;
  created: number;
  item: string | null;
};
export async function walletHistory(
  db: D1Database,
  account: string | null,
  params: URLSearchParams,
) {
  await requireAccount(db, account);
  const filter = params.get('filter') ?? 'all';
  const raw = params.get('cursor');
  const cursor = raw === null ? Number.MAX_SAFE_INTEGER : Number(raw);
  if (
    !['all', 'earned', 'spent', 'purchased'].includes(filter) ||
    !Number.isSafeInteger(cursor) ||
    cursor <= 0
  )
    throw Error('Invalid wallet page.');
  const clause =
    filter === 'earned'
      ? "AND l.origin='earned' AND l.kind IN ('earn','reversal')"
      : filter === 'spent'
        ? "AND l.kind='spend'"
        : filter === 'purchased'
          ? "AND l.kind='purchase'"
          : '';
  const [balance, history] = await db.batch([
    db.prepare('SELECT balance FROM wallets WHERE account=?').bind(account),
    db
      .prepare(`SELECT l.id,l.amount,l.balance_after,l.kind,l.reason,l.created,
      (SELECT name FROM cosmetics WHERE id=l.source AND l.reason='cosmetic') AS item
      FROM trust_ledger l JOIN wallets w ON w.id=l.wallet WHERE w.account=? AND l.id<? ${clause} ORDER BY l.id DESC LIMIT 51`)
      .bind(account, cursor),
  ]);
  const rows = history.results as HistoryEntry[];
  return {
    balance:
      (balance.results[0] as { balance: number } | undefined)?.balance ?? 0,
    entries: rows.slice(0, 50),
    cursor: rows.length > 50 ? String(rows[49].id) : null,
  };
}
