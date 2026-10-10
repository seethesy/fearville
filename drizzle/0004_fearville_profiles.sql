ALTER TABLE accounts ADD COLUMN handle_changed_at integer;
--> statement-breakpoint
CREATE TABLE account_profiles (
  account text PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lobby_name text NOT NULL DEFAULT '',
  avatar text NOT NULL DEFAULT 'ghost',
  death_effect text NOT NULL DEFAULT 'spirit',
  settings text NOT NULL DEFAULT '{}',
  last_seen integer NOT NULL DEFAULT 0,
  online_visible integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
ALTER TABLE games ADD COLUMN recap text;
