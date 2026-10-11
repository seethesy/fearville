CREATE TABLE `session_snapshots` (
	`code` text NOT NULL,
	`id` text NOT NULL,
	`state` text NOT NULL,
	PRIMARY KEY(`code`, `id`),
	FOREIGN KEY (`code`) REFERENCES `sessions`(`code`) ON UPDATE no action ON DELETE cascade
);
