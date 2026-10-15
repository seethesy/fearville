// All mutations use an INSERT whose ledger trigger updates the cached balance.
// D1 executes each statement serially and each batch as one transaction.
export type TrustKind =
  | 'earn'
  | 'spend'
  | 'purchase'
  | 'refund'
  | 'chargeback'
  | 'admin'
  | 'reversal';
export type TrustOrigin = 'earned' | 'purchased' | 'mixed';
export type TrustEntry = {
  id: number;
  amount: number;
  balance_after: number;
  kind: TrustKind;
  origin: TrustOrigin;
  source: string;
  reason: string;
  created: number;
};
export class WalletError extends Error {
  code:
    | 'not_signed_in'
    | 'insufficient_trust'
    | 'invalid_amount'
    | 'invalid_key'
    | 'idempotency_conflict';
  constructor(code: WalletError['code']) {
    super(code);
    this.code = code;
  }
}
export type Mutation = {
  amount: number;
  kind: TrustKind;
  origin: TrustOrigin;
  source: string;
  reason: string;
  key: string;
  now?: number;
};
export function validateMutation(m: Mutation) {
  if (
    !Number.isSafeInteger(m.amount) ||
    m.amount === 0 ||
    (m.kind === 'spend' && m.amount > 0)
  )
    throw new WalletError('invalid_amount');
  if (
    ![m.key, m.source, m.reason].every(
      (v) => typeof v === 'string' && v.length > 0 && v.length <= 200,
    )
  )
    throw new WalletError('invalid_key');
}
export async function requireAccount(db: D1Database, account: string | null) {
  if (
    !account ||
    !(await db
      .prepare("SELECT 1 FROM accounts WHERE id=? AND role='player'")
      .bind(account)
      .first())
  )
    throw new WalletError('not_signed_in');
  return account;
}
export function createWalletStatement(db: D1Database, account: string) {
  return db
    .prepare(
      "INSERT INTO wallets(id,account) SELECT ?,id FROM accounts WHERE id=? AND role='player' ON CONFLICT(account) DO NOTHING",
    )
    .bind(crypto.randomUUID(), account);
}
// Also used by shop transactions, so debit and ownership commit together.
export function ledgerStatement(db: D1Database, account: string, m: Mutation) {
  validateMutation(m);
  return db
    .prepare(`INSERT INTO trust_ledger(wallet,amount,balance_after,kind,origin,source,reason,idempotency_key,created)
    SELECT id,?,balance+?,?,?,?,?,?,? FROM wallets WHERE account=?
    AND NOT EXISTS(SELECT 1 FROM trust_ledger WHERE wallet=wallets.id AND idempotency_key=?)`)
    .bind(
      m.amount,
      m.amount,
      m.kind,
      m.origin,
      m.source,
      m.reason,
      m.key,
      m.now ?? Date.now(),
      account,
      m.key,
    );
}
export async function readBalance(db: D1Database, account: string | null) {
  await requireAccount(db, account);
  return (
    (
      await db
        .prepare('SELECT balance FROM wallets WHERE account=?')
        .bind(account)
        .first<{ balance: number }>()
    )?.balance ?? 0
  );
}
export async function mutateWallet(
  db: D1Database,
  account: string | null,
  m: Mutation,
): Promise<TrustEntry> {
  const owner = await requireAccount(db, account);
  validateMutation(m);
  try {
    await db.batch([
      createWalletStatement(db, owner),
      ledgerStatement(db, owner, m),
    ]);
  } catch (e) {
    if (String(e).includes('insufficient_trust'))
      throw new WalletError('insufficient_trust');
    throw e;
  }
  const entry = await db
    .prepare(
      'SELECT l.* FROM trust_ledger l JOIN wallets w ON w.id=l.wallet WHERE w.account=? AND l.idempotency_key=?',
    )
    .bind(owner, m.key)
    .first<TrustEntry>();
  if (!entry) throw Error('Wallet entry was not saved.');
  if (
    entry.amount !== m.amount ||
    entry.kind !== m.kind ||
    entry.origin !== m.origin ||
    entry.source !== m.source ||
    entry.reason !== m.reason
  )
    throw new WalletError('idempotency_conflict');
  return entry;
}
export function credit(
  db: D1Database,
  account: string | null,
  m: Omit<Mutation, 'kind'>,
) {
  if (m.amount <= 0) throw new WalletError('invalid_amount');
  return mutateWallet(db, account, { ...m, kind: 'earn' });
}
export function debit(
  db: D1Database,
  account: string | null,
  m: Omit<Mutation, 'kind'>,
) {
  if (m.amount >= 0) throw new WalletError('invalid_amount');
  return mutateWallet(db, account, { ...m, kind: 'spend' });
}
export async function checkIntegrity(db: D1Database) {
  return (
    await db
      .prepare(
        'SELECT w.id,w.balance,COALESCE(SUM(l.amount),0) AS total FROM wallets w LEFT JOIN trust_ledger l ON l.wallet=w.id GROUP BY w.id HAVING w.balance<>COALESCE(SUM(l.amount),0)',
      )
      .all()
  ).results;
}
