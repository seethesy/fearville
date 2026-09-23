CREATE TABLE `friendships` (
	`requester` text NOT NULL,
	`addressee` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`requester`, `addressee`),
	FOREIGN KEY (`requester`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addressee`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_friendships_addressee` ON `friendships` (`addressee`);--> statement-breakpoint
CREATE TABLE `game_players` (
	`game` text NOT NULL,
	`player` text NOT NULL,
	`account` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`team` text NOT NULL,
	`won` integer NOT NULL,
	`alive` integer NOT NULL,
	PRIMARY KEY(`game`, `player`),
	FOREIGN KEY (`game`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_game_players_account` ON `game_players` (`account`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`host_account` text,
	`host_name` text NOT NULL,
	`winner` text NOT NULL,
	`reason` text NOT NULL,
	`players` integer NOT NULL,
	`days` integer NOT NULL,
	`nights` integer NOT NULL,
	`started` integer NOT NULL,
	`ended` integer NOT NULL,
	FOREIGN KEY (`host_account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_games_host` ON `games` (`host_account`);--> statement-breakpoint
CREATE TABLE `session_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `sessions`(`code`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_session_invites_pair` ON `session_invites` (`code`,`recipient`);--> statement-breakpoint
CREATE INDEX `idx_session_invites_recipient` ON `session_invites` (`recipient`);--> statement-breakpoint
CREATE TABLE `storyteller_ratings` (
	`game` text NOT NULL,
	`rater` text NOT NULL,
	`storyteller` text NOT NULL,
	`stars` integer NOT NULL,
	`comment` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`game`, `rater`),
	FOREIGN KEY (`game`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rater`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`storyteller`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ratings_storyteller` ON `storyteller_ratings` (`storyteller`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `handle` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_accounts_handle` ON `accounts` (`handle`);