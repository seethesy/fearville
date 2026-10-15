import { requireAccount, createWalletStatement } from './wallet.ts';
export type ShopErrorCode =
  | 'not_signed_in'
  | 'not_found'
  | 'unavailable'
  | 'already_owned'
  | 'insufficient_trust'
  | 'invalid_request'
  | 'idempotency_conflict';
export class ShopError extends Error {
  code: ShopErrorCode;
  constructor(code: ShopErrorCode) {
    super(code);
    this.code = code;
  }
}
export type Purchase = {
  id: number;
  cosmetic: string;
  price: number;
  balance_after: number;
  created: number;
};
export async function purchase(
  db: D1Database,
  account: string | null,
  cosmetic: unknown,
  key: unknown,
  now = Date.now(),
): Promise<Purchase> {
  try {
    await requireAccount(db, account);
  } catch {
    throw new ShopError('not_signed_in');
  }
  if (
    typeof cosmetic !== 'string' ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(cosmetic) ||
    typeof key !== 'string' ||
    !/^[A-Za-z0-9:_-]{1,100}$/.test(key)
  )
    throw new ShopError('invalid_request');
  if (
    !(await db
      .prepare('SELECT 1 FROM cosmetics WHERE id=?')
      .bind(cosmetic)
      .first())
  )
    throw new ShopError('not_found');
  try {
    await db.batch([
      createWalletStatement(db, account!),
      db
        .prepare(`INSERT INTO trust_purchases(wallet,cosmetic,price,balance_after,idempotency_key,created)
        SELECT w.id,c.id,c.price,w.balance-c.price,?,? FROM wallets w,cosmetics c WHERE w.account=? AND c.id=?
        AND NOT EXISTS(SELECT 1 FROM trust_purchases WHERE wallet=w.id AND idempotency_key=?)`)
        .bind(key, now, account, cosmetic, key),
    ]);
  } catch (e) {
    for (const code of [
      'unavailable',
      'already_owned',
      'insufficient_trust',
    ] as const)
      if (String(e).includes(code)) throw new ShopError(code);
    throw e;
  }
  const result = await db
    .prepare(
      'SELECT p.id,p.cosmetic,p.price,p.balance_after,p.created FROM trust_purchases p JOIN wallets w ON w.id=p.wallet WHERE w.account=? AND p.idempotency_key=?',
    )
    .bind(account, key)
    .first<Purchase>();
  if (!result) throw Error('Purchase could not be saved.');
  if (result.cosmetic !== cosmetic) throw new ShopError('idempotency_conflict');
  return result;
}
