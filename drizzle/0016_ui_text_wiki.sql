-- FEAR-173: wiki-style text editing (trusted editors, drafts, edit summaries).
CREATE TABLE `text_editors` (
	`account` text PRIMARY KEY NOT NULL,
	`granted` integer NOT NULL,
	`granted_by` text NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ui_text_drafts` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`summary` text,
	`base` integer DEFAULT 0 NOT NULL,
	`editor` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ui_text_versions` ADD `summary` text;