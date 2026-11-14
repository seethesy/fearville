CREATE TABLE `puzzle_generation_versions` (
  `revision` integer PRIMARY KEY NOT NULL,
  `settings` text NOT NULL,
  `created` integer NOT NULL,
  CONSTRAINT `puzzle_generation_revision` CHECK (`revision` > 0)
);
--> statement-breakpoint
CREATE TRIGGER puzzle_generation_versions_no_update
BEFORE UPDATE ON puzzle_generation_versions BEGIN
  SELECT RAISE(ABORT, 'Puzzle tuning history is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER puzzle_generation_versions_no_delete
BEFORE DELETE ON puzzle_generation_versions BEGIN
  SELECT RAISE(ABORT, 'Puzzle tuning history is immutable');
END;
