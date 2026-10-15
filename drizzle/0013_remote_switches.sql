CREATE TABLE `feature_flags` (
	`key` text NOT NULL,
	`environment` text NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`key`, `environment`)
);
