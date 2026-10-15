# Trust economy

Balances are integer trust. Only the wallet service writes ledger entries; SQL
triggers atomically validate and apply each entry. The ledger is the immutable
audit trail. `checkIntegrity(db)` returns wallets whose balance differs from the
sum of entries; the future reconciliation job should call it.

Every mutation requires an account-scoped idempotency key. Reusing a key with
different parameters is an error. Negative balances can result from refunds,
chargebacks, game rewinds or rating corrections; spending is blocked until the
balance recovers. Credits can gradually repay a negative balance.

Deleting an account clears its wallet's account reference. The orphan wallet and
ledger remain for integrity, without names, emails, rating identities or arbitrary
metadata. Sources are opaque game/order references; never store personal data in
sources, reasons or keys. Rating accounting must use private bookkeeping rather
than rater identities in ledger entries.

Migration 0014 is additive. For a disposable development database only, rollback
by dropping the trust ledger triggers, `trust_ledger`, then `wallets`. Production
rollback keeps the tables and rolls back application code.
