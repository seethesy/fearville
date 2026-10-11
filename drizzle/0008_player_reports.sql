-- FEAR-119: player reports for the moderation queue (admin console, FEAR-31).
-- Numbered 0008 to leave 0007 for the admin console migration.
CREATE TABLE IF NOT EXISTS `player_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`note` text NOT NULL DEFAULT '',
	`reporter_account` text,
	`reporter_seat` text,
	`target_account` text,
	`target_name` text NOT NULL DEFAULT '',
	`code` text,
	`game` text,
	`message_id` text,
	`content` text NOT NULL DEFAULT '',
	`status` text NOT NULL DEFAULT 'open',
	`created` integer NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`resolution` text,
	FOREIGN KEY (`reporter_account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_player_reports_status` ON `player_reports` (`status`,`created`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_player_reports_target` ON `player_reports` (`target_account`);
