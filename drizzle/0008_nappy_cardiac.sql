CREATE TABLE `player_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`reporter_account` text,
	`reporter_seat` text,
	`target_account` text,
	`target_name` text DEFAULT '' NOT NULL,
	`code` text,
	`game` text,
	`message_id` text,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created` integer NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`resolution` text,
	FOREIGN KEY (`reporter_account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_player_reports_status` ON `player_reports` (`status`,`created`);--> statement-breakpoint
CREATE INDEX `idx_player_reports_target` ON `player_reports` (`target_account`);