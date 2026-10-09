CREATE TABLE `account_settings` (
	`account` text PRIMARY KEY NOT NULL,
	`stats_visibility` text DEFAULT 'friends' NOT NULL,
	`history_visibility` text DEFAULT 'friends' NOT NULL,
	`friend_requests` text DEFAULT 'everyone' NOT NULL,
	`game_invites` text DEFAULT 'friends' NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ranked_seats` (
	`account` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`game` text NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code`) REFERENCES `sessions`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `game_players` ADD `role_type` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `game_players` ADD `base_xp` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `game_players` ADD `mvp_xp` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `game_players` ADD `mvp_votes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `game_players` ADD `rating_before` integer;--> statement-breakpoint
ALTER TABLE `game_players` ADD `opponent_rating` real;--> statement-breakpoint
ALTER TABLE `game_players` ADD `team_rating` real;--> statement-breakpoint
ALTER TABLE `game_players` ADD `elo_delta` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `script` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `ranked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `host_xp` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_games_ended ON games(ended);
--> statement-breakpoint
CREATE INDEX idx_ranked_seats_code ON ranked_seats(code);
