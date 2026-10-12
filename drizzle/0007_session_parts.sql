CREATE TABLE `session_parts` (
	`code` text NOT NULL,
	`part` text NOT NULL,
	`state` text NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`code`, `part`),
	FOREIGN KEY (`code`) REFERENCES `sessions`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `write_id` text;