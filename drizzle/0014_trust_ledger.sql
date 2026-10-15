CREATE TABLE wallets (
  id TEXT PRIMARY KEY NOT NULL,
  account TEXT UNIQUE REFERENCES accounts(id) ON DELETE SET NULL,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(typeof(balance)='integer')
);
CREATE TABLE trust_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL REFERENCES wallets(id),
  amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount<>0),
  balance_after INTEGER NOT NULL CHECK(typeof(balance_after)='integer'),
  kind TEXT NOT NULL CHECK(kind IN ('earn','spend','purchase','refund','chargeback','admin','reversal')),
  origin TEXT NOT NULL CHECK(origin IN ('earned','purchased','mixed')),
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE(wallet,idempotency_key)
);
CREATE INDEX idx_trust_ledger_wallet ON trust_ledger(wallet,id);
CREATE TRIGGER trust_ledger_validate BEFORE INSERT ON trust_ledger BEGIN
  SELECT RAISE(ABORT,'wallet_conflict') WHERE NEW.balance_after<>(SELECT balance+NEW.amount FROM wallets WHERE id=NEW.wallet);
  SELECT RAISE(ABORT,'insufficient_trust') WHERE NEW.amount<0 AND NEW.balance_after<0 AND NEW.kind NOT IN ('refund','chargeback','reversal');
  SELECT RAISE(ABORT,'invalid_amount') WHERE NEW.kind='spend' AND NEW.amount>0;
END;
CREATE TRIGGER trust_ledger_apply AFTER INSERT ON trust_ledger BEGIN
  UPDATE wallets SET balance=NEW.balance_after WHERE id=NEW.wallet;
END;
CREATE TRIGGER trust_ledger_no_update BEFORE UPDATE ON trust_ledger BEGIN
  SELECT RAISE(ABORT,'immutable_ledger');
END;
CREATE TRIGGER trust_ledger_no_delete BEFORE DELETE ON trust_ledger BEGIN
  SELECT RAISE(ABORT,'immutable_ledger');
END;
CREATE TRIGGER wallets_balance_guard BEFORE UPDATE OF balance ON wallets
WHEN NEW.balance<>COALESCE((SELECT SUM(amount) FROM trust_ledger WHERE wallet=NEW.id),0)
BEGIN SELECT RAISE(ABORT,'ledger_required'); END;
CREATE TRIGGER wallets_initial_balance BEFORE INSERT ON wallets WHEN NEW.balance<>0
BEGIN SELECT RAISE(ABORT,'ledger_required'); END;
