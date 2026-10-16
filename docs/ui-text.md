# Editable official text (FEAR-40, FEAR-173)

Official player-visible text lives in `lib/ui-text/registry.ts` as stable keys
with bundled defaults. Published edits are immutable rows in
`ui_text_versions`; the newest row per key wins. Clients poll `/api/ui-text`.

## What is editable

- Interface labels (`home.*`, `lobby.*`, `flow.*`, `nav.*`, `footer.*`).
- Every tutorial, section tutorial, Storyteller tour and Night Rite guide
  (`tutorial.<id>.title|summary`, `tutorial.<id>.<step>.title|body`).
- Glossary (`glossary.<id>.term|definition|example`).
- Character names and ability text (`role.<id>.name|ability`). **Display
  only**: the engine works from role ids, so rewording never changes rules.
- Role tips (`tips.<script>.<role>.<n>`).

`docs/content-review/ui-text-audit.md` (regenerate with
`node scripts/audit-ui-text.mjs`) lists text that is not yet editable.

## Formats

Long content (tutorial bodies and summaries, glossary definitions and
examples, role tips) is a small markdown subset, rendered as React elements by
`components/markdown-text.tsx` (never HTML): paragraphs, line breaks, `- `
lists, `**bold**`, `*italic*`, `[text](https://…)`, `[text](/path)`,
`[[Glossary term]]` and `[text](glossary:id)`. Other keys are plain text.
Named placeholders such as `{count}` must be kept.

## Editing

- Editors: the admin account and trusted editors
  (`editor grant @user`, `editor revoke @user`, `editors` in the console).
- Turn on **Edit text** (bottom left, or the admin console's Edit official
  text tab), then use the pencil on any highlighted text.
- **Save draft** stores an unpublished draft (`ui_text_drafts`, one per key);
  players never see drafts. **Publish this field** turns the draft into a new
  version; it is refused if someone published that key meanwhile.
- History shows who, when, the edit summary and a word diff; **Revert to
  this** publishes any earlier version (or the default) as a new version.
- Every draft, discard, publish and revert is in the admin audit log.

## API

`/api/ui-text`: `GET` (public overrides), `GET ?view=me|drafts|history&key=|catalog`,
`POST { action: draft|discard|publish|revert, key, … }` (editors only, rate limited).
