CREATE TABLE `feedback_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`context` text NOT NULL,
	`version` integer NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`definition` text NOT NULL,
	`created` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_forms_version` ON `feedback_forms` (`context`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_forms_active` ON `feedback_forms` (`context`) WHERE "feedback_forms"."active" = 1;--> statement-breakpoint
CREATE TABLE `feedback_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form` text NOT NULL,
	`context` text NOT NULL,
	`version` integer NOT NULL,
	`account` text,
	`guest` text,
	`subject` text,
	`answers` text NOT NULL,
	`client` text,
	`game` text,
	`flagged` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`form`) REFERENCES `feedback_forms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_feedback_submissions_context` ON `feedback_submissions` (`context`,`created`);--> statement-breakpoint
CREATE INDEX `idx_feedback_submissions_account` ON `feedback_submissions` (`account`);--> statement-breakpoint
-- FEAR-159: version 1 of each form (lib/feedback/forms.ts DEFAULT_FORMS).
INSERT INTO `feedback_forms` (`id`,`context`,`version`,`active`,`definition`,`created`,`created_by`) VALUES ('general:1','general',1,1,'{"context":"general","title":"Send feedback","questions":[{"id":"overall","type":"stars","label":"How is Fearville so far?"},{"id":"area","type":"single","label":"What is this about?","options":[{"id":"game","label":"Playing a game"},{"id":"storyteller","label":"Storyteller tools"},{"id":"social","label":"Friends and profiles"},{"id":"other","label":"Something else"}]},{"id":"comment","type":"long","label":"Tell us more","required":true}]}',0,'seed');--> statement-breakpoint
INSERT INTO `feedback_forms` (`id`,`context`,`version`,`active`,`definition`,`created`,`created_by`) VALUES ('bug:1','bug',1,1,'{"context":"bug","title":"Report a problem","questions":[{"id":"what","type":"long","label":"What happened?","required":true},{"id":"expected","type":"long","label":"What did you expect to happen?"},{"id":"email","type":"short","label":"Contact email (optional)"}]}',0,'seed');--> statement-breakpoint
INSERT INTO `feedback_forms` (`id`,`context`,`version`,`active`,`definition`,`created`,`created_by`) VALUES ('script:1','script',1,1,'{"context":"script","title":"Rate this script","subject":"script","questions":[{"id":"rating","type":"stars","label":"How much did you enjoy this script?","required":true},{"id":"comment","type":"long","label":"Anything to add?"}]}',0,'seed');--> statement-breakpoint
INSERT INTO `feedback_forms` (`id`,`context`,`version`,`active`,`definition`,`created`,`created_by`) VALUES ('puzzle:1','puzzle',1,1,'{"context":"puzzle","title":"Rate this puzzle","subject":"puzzle","questions":[{"id":"rating","type":"stars","label":"How much did you enjoy this puzzle?","required":true},{"id":"difficulty","type":"single","label":"How hard was it?","options":[{"id":"easy","label":"Too easy"},{"id":"right","label":"About right"},{"id":"hard","label":"Too hard"}]},{"id":"comment","type":"long","label":"Anything to add?"}]}',0,'seed');--> statement-breakpoint
INSERT INTO `feedback_forms` (`id`,`context`,`version`,`active`,`definition`,`created`,`created_by`) VALUES ('game-end:1','game-end',1,1,'{"context":"game-end","title":"How was the game?","subject":"game","questions":[{"id":"rating","type":"stars","label":"How much fun was this game?","required":true},{"id":"highlights","type":"multi","label":"What stood out?","options":[{"id":"roles","label":"Characters"},{"id":"rite","label":"Night Rite"},{"id":"voting","label":"Nominations and voting"},{"id":"app","label":"The app"}]},{"id":"comment","type":"long","label":"Anything to add?"}]}',0,'seed');
