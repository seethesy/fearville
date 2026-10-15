# Trust economy

Tune `lib/trust/config.ts`: finish 20, win +10, night 2 and five distinct
signed-in player accounts required (host excluded from that count). Host earns
finish only. Sandbox, abandoned and unfinished games earn nothing. Total earned
trust is capped at 200 per account per UTC day and 45 per game (30 play + 15
ratings). Rating bonuses require three eligible distinct raters: 4 stars earns 5,
5 stars earns 10, lower ratings earn zero, with a 15 trust rating cap per game.
Caps use net earned ledger amounts, including corrections; purchases do not
consume earning caps. There are no retroactive awards for guest seats linked
after game end. Rewind reverses awards; re-ending begins a new idempotent cycle.

Rating revisions recompute the capped per-game entitlement and append only its
difference from the net bonus already paid. The rating upsert and bonus update
share one D1 transaction. Lower ratings may create a negative wallet after trust
has been spent. The private `trust_account_links` table excludes known account
pairs from rating rewards; insert ordered account IDs after an administrative
review. This release does not infer identity from shared IPs or add an admin UI.
Only the opaque game reference appears in the bonus ledger; pair exclusions and
individual ratings are never returned by the wallet API.

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
