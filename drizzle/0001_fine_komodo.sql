CREATE TABLE `account_seats` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`code` text NOT NULL,
	`player` text NOT NULL,
	`host` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code`) REFERENCES `sessions`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_seats_account` ON `account_seats` (`account`);--> statement-breakpoint
CREATE TABLE `account_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_sessions_account` ON `account_sessions` (`account`);--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`provider` text NOT NULL,
	`refresh_token` text,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_identities_account` ON `identities` (`account`);--> statement-breakpoint
CREATE TABLE `native_codes` (
	`hash` text PRIMARY KEY NOT NULL,
	`account` text NOT NULL,
	`challenge` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_flows` (
	`hash` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`verifier` text NOT NULL,
	`nonce` text NOT NULL,
	`browser` text,
	`account` text,
	`member` text,
	`native_challenge` text,
	`launched` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
