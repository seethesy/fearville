CREATE TABLE `client_versions` (
	`day` text NOT NULL,
	`client` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `client`)
);
