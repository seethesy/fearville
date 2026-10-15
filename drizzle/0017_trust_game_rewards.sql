-- Intentionally survives withdrawal/deletion of the public game record.
CREATE TABLE trust_game_rewards (
 game TEXT PRIMARY KEY NOT NULL,
 cycle INTEGER NOT NULL DEFAULT 1,
 active INTEGER NOT NULL DEFAULT 1,
 eligible TEXT NOT NULL,
 player_count INTEGER NOT NULL,
 created INTEGER NOT NULL
);
