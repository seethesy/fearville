CREATE TABLE `tutorial_progress` (
	`account` text NOT NULL,
	`tutorial` text NOT NULL,
	`status` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`account`, `tutorial`),
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
