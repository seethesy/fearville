-- Append-only admin and text history (FEAR-31).
CREATE TRIGGER admin_audit_no_update BEFORE UPDATE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER admin_audit_no_delete BEFORE DELETE ON admin_audit BEGIN SELECT RAISE(ABORT,'Audit entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ui_text_no_update BEFORE UPDATE ON ui_text_versions BEGIN SELECT RAISE(ABORT,'Text versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER ui_text_no_delete BEFORE DELETE ON ui_text_versions BEGIN SELECT RAISE(ABORT,'Text versions are immutable'); END;
