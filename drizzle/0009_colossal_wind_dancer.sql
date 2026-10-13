CREATE TABLE `account_items` (
	`account` text NOT NULL,
	`item` text NOT NULL,
	PRIMARY KEY(`account`, `item`),
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `admin_assertions` (
	`ok` integer NOT NULL,
	CONSTRAINT "admin_assertion_ok" CHECK("admin_assertions"."ok"=1)
);
--> statement-breakpoint
CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`admin` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`parameters` text NOT NULL,
	`result` text NOT NULL,
	`before_value` text,
	`after_value` text
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_at` ON `admin_audit` (`at`);--> statement-breakpoint
CREATE TABLE `admin_confirmations` (
	`hash` text PRIMARY KEY NOT NULL,
	`admin` text NOT NULL,
	`session` text NOT NULL,
	`command` text NOT NULL,
	`digest` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_progression` (
	`account` text PRIMARY KEY NOT NULL,
	`xp_offset` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ui_text_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`at` integer NOT NULL,
	`admin` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ui_text_versions_key` ON `ui_text_versions` (`key`,`id`);--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `verified_email` text;--> statement-breakpoint
ALTER TABLE `account_sessions` ADD `issued` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `role` text DEFAULT 'player' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `google_email` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `banned` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `muted_until` integer;--> statement-breakpoint
ALTER TABLE `accounts` ADD `admin_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `native_codes` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `native_codes` ADD `verified_email` text;