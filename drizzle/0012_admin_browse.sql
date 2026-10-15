CREATE TABLE `admin_table_grants` (
	`token` text PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`code` text NOT NULL,
	`mode` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`admin`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_admin_table_grants_admin` ON `admin_table_grants` (`admin`);--> statement-breakpoint
CREATE TABLE `admin_views` (
	`session` text PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`viewer` text NOT NULL,
	`account` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`admin`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
