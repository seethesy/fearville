-- Private anti-collusion data. No public endpoint exposes account pairs.
CREATE TABLE trust_account_links (
 account_low TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 account_high TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 PRIMARY KEY(account_low,account_high), CHECK(account_low<account_high)
);
-- Revision survives game withdrawal, so a re-created rating never reuses a key.
CREATE TABLE trust_rating_states (
 game TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
