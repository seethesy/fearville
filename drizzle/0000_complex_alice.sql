CREATE TABLE `members` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`player` text NOT NULL,
	`host` integer NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `sessions`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_members_code` ON `members` (`code`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL
);
