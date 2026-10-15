CREATE TABLE trust_purchases (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 wallet TEXT NOT NULL REFERENCES wallets(id),
 cosmetic TEXT NOT NULL REFERENCES cosmetics(id),
 price INTEGER NOT NULL CHECK(price>=0),
 balance_after INTEGER NOT NULL,
 idempotency_key TEXT NOT NULL,
 created INTEGER NOT NULL,
 UNIQUE(wallet,idempotency_key)
);
CREATE TRIGGER trust_purchase_validate BEFORE INSERT ON trust_purchases BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cosmetics WHERE id=NEW.cosmetic AND available=1 AND (starts IS NULL OR starts<=NEW.created) AND (ends IS NULL OR ends>NEW.created)) THEN RAISE(ABORT,'unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM cosmetics WHERE id=NEW.cosmetic AND is_default=1) OR EXISTS(SELECT 1 FROM owned_cosmetics o JOIN wallets w ON o.account=w.account WHERE w.id=NEW.wallet AND o.cosmetic=NEW.cosmetic) THEN RAISE(ABORT,'already_owned') END;
 SELECT CASE WHEN NEW.price<>(SELECT price FROM cosmetics WHERE id=NEW.cosmetic) OR NEW.balance_after<>(SELECT balance-NEW.price FROM wallets WHERE id=NEW.wallet) THEN RAISE(ABORT,'wallet_conflict') END;
 SELECT CASE WHEN (SELECT balance FROM wallets WHERE id=NEW.wallet)<0 OR NEW.balance_after<0 THEN RAISE(ABORT,'insufficient_trust') END;
END;
CREATE TRIGGER trust_purchase_apply AFTER INSERT ON trust_purchases BEGIN
 INSERT INTO trust_ledger(wallet,amount,balance_after,kind,origin,source,reason,idempotency_key,created)
 SELECT NEW.wallet,-NEW.price,NEW.balance_after,'spend','mixed',NEW.cosmetic,'cosmetic','shop:' || NEW.idempotency_key,NEW.created WHERE NEW.price>0;
 INSERT INTO owned_cosmetics(account,cosmetic,acquired,method)
 SELECT account,NEW.cosmetic,NEW.created,'purchase' FROM wallets WHERE id=NEW.wallet;
END;
CREATE TRIGGER trust_purchase_no_update BEFORE UPDATE ON trust_purchases BEGIN SELECT RAISE(ABORT,'immutable_purchase'); END;
CREATE TRIGGER trust_purchase_no_delete BEFORE DELETE ON trust_purchases BEGIN SELECT RAISE(ABORT,'immutable_purchase'); END;
