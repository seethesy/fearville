# Feedback forms (FEAR-159)

Server foundation for feedback and bug report forms. Form content is data in D1, so the developer
account's editor (later ticket) can change it without a deploy.

- **Forms** (`feedback_forms`): one row per version, id `context:version`, immutable. Exactly one
  active version per context (`general`, `bug`, `script`, `puzzle`, `game-end`). `publishForm()` in
  `lib/feedback/store.ts` validates a definition, stores the next version and makes it active.
  Version 1 of each context is seeded by `drizzle/0011_feedback_forms.sql` from `DEFAULT_FORMS`.
- **Questions**: `stars` (1–5), `single`, `multi`, `short` (200), `long` (4000); optional
  `required`. A form may bind a `subject` (`script`, `puzzle`, `game`) that the client fills from
  context; script and puzzle subjects are checked against the known ids.
- **Submissions** (`feedback_submissions`): form id and version, answers (plain text, control
  characters stripped), account id or an anonymous guest id the device keeps, subject. Objectionable
  text is kept but `flagged`. Bug reports also store whitelisted client details (app version,
  build, platform, OS, connection, last 20 request ids, trace id) and, when the reporter is seated
  at the given table code, public table details (code, phase, day, night, script, player count,
  Storyteller or player). Never roles, alignments, notes or chat. FEAR-111 ("Report a problem")
  uses the `bug` context and these helpers.
- **API**: `GET /api/feedback?context=` returns the active form. `POST /api/feedback`
  `{ form, answers, subject?, guest?, client?, code? }`; 16 KB body limit; rate limited 10/min for
  accounts and 5/min for guests.
- **Decisions (Art)**: guests can submit; players do not see past submissions; no retention limit
  (submissions are deleted with the account); bug reports and feedback share this system.
