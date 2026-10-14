# AGENTS.md

Guide for coding agents (Codex, Claude Code). Read this instead of README.md.
Spend tokens on code: CI tests and deploys, so don't explore beyond the files
a ticket names.

## Architecture

Fearville is a companion app for an in-person social deduction game: a
Storyteller runs the table and 5–18 players use phones. One server-authoritative
backend: a Cloudflare Worker (vinext, React server components) with D1
(`DB`, schema in `db/schema.ts`, migrations in `drizzle/`). Each table's game
state is JSON in `sessions.state`; clients poll `/api/game` and post actions.
Durable Objects + WebSockets (Jira FEAR-78) and web-in-native shells (FEAR-79)
are planned work, not the current architecture. The `ios/` SwiftUI client
currently remains supported; keep its workflow until its replacement lands.

## Repo map

- `app/`: routes and pages. `app/table/page.tsx` is the live table route; `app/table/page/` holds state, display values, fields, header/navigation, flow, seats, dialogs and the entry screen. `app/api/*/route.ts` holds the HTTP APIs: `session` (create/join/leave), `game` (poll and actions), `rite`, `social`, `accounts`, `tutorials`.
- `components/`: UI. `rite/night-rite.tsx` (Rite UI entry; `rite/night-rite/` contains shell, setup, pattern controls and host vigil) and `rite/art.tsx` (artwork entry; `rite/art/` contains one module per pattern), `table-*.tsx`, `hub/` (site shell, settings), `social/`, `tutorials/`. `components/ui/` is the untouched shadcn starter.
- `lib/game/`: game domain.
  - `engine.ts`: rules and actions (`execute`)
  - `view.ts`: per-player view entry; `view/` contains fields, host phase/seat controls, shared controls and player view; never leak hidden info
  - `store.ts`: auth, D1 reads/writes, `limited()` rate limit
  - `hof.ts` / `hof-view.ts`: Horrors of Fearville (default script)
  - `hms.ts` / `hms-view.ts`: Holy Moon and Stars
  - `types.ts`: roles and game types
  - `saved-state.ts`: loading older saved tables
  - `lobby.ts`, `join.ts`, `membership.ts`, `sandbox.ts`, `scoped-update.ts` / `concurrency.ts`: concurrent writes
- `lib/rite/`: the Night Rite (team puzzles).
  - `types.ts`: `DEFAULT_CONFIG` (opening night, `lockSeconds`, `windowSeconds` = puzzle window, threshold) and patterns
  - `engine.ts`: config validation and ranges, vigils, night lifecycle, **turn order and handoff (`nextTurn`)**, `riteAction`
  - `view.ts`: player view of a puzzle
  - Patterns: `board.ts` (Escape Fearville), `grid.ts` (The Sphinx's Riddles), `ritual.ts` (Ritual of Divination), `lab.ts` (Alchemist's Laboratory)
  - `bank.ts` with generated `bank-data.ts`
- `lib/social/`: friends, invites, ratings, results, stats, progression, privacy.
- `lib/accounts/`: Google/Apple OIDC, account service, profile, preferences.
- `lib/tutorials/`: tutorial content, engine, progress.
- `db/`: Drizzle schema and D1 accessor.
- `tests/`: `*.test.ts` unit tests (node:test) and `*-integration.mjs` HTTP suites (local D1 only).
- `scripts/`: test runners (`check.mjs`, `run-unit.mjs`, `run-integration.mjs`) and offline generators.
- `hooks/`: shared React hooks; `public/`: static branding, fonts and illustrations.
- `ios/`: native SwiftUI client and project; `.github/`: CI and retained iOS workflow.
- `drizzle/`: numbered additive SQL migrations; `.openai/`: existing Sites identity.
- `package.json`: commands/dependencies; `vite.config.ts`: Worker build; `wrangler.local.json`: local DB binding; `wrangler.jsonc` (FEAR-83): own-account environments.
- `docs/`: [setup](docs/setup.md), [testing](docs/testing.md), [deploy](docs/deploy.md), [mobile](docs/mobile.md), [account setup](docs/account-setup.md), [social system](docs/social-system.md), [features](docs/features.md), [Night Rite](docs/night-rite.md).

## Commands

- `npm run check`: typecheck + lint + unit tests. **Run this before committing.**
- `npm run test:unit -- tests/rite.test.ts`: one targeted unit file.
- **Don't run** `npm test`, `npm run test:integration`, `npm run build` or the dev server unless the user asks. CI does it.
- Don't run `npm run format` on the whole repo. CI formats the files you changed.

## Rules

- One Git branch per Jira ticket: `FEAR-<key>-short-name`, branched from `main`. Open a PR; don't commit to `main`.
- **Never deploy, never run mobile builds (`xcodebuild`, Gradle), never edit secret values or credential files.** Non-secret `.env.example` documentation may be updated for a ticket.
- Migrations are additive only (new tables, nullable columns). A destructive change needs two releases; see [docs/deploy.md](docs/deploy.md).
- API and view-model changes are additive: add optional fields; never rename or remove a field in the same release.
- **Hidden information** (roles, alignments, night actions, notes, private messages, tokens) never goes into another player's view, push payloads, logs, or error reports. `lib/game/view.ts` builds each player's view.
- Rate-limit new write endpoints with `limited()` from `lib/game/store.ts`.
- Generated files carry a `GENERATED` header. Regenerate them; never hand-edit.
- Keep changes scoped to the ticket. Tickets list likely files; start there.

## After pushing

Read CI results compactly: `gh pr checks <pr>`, then for a failure
`gh run view <run-id> --log-failed` or the run's job summary. Don't open full logs.

## Do not read

These are generated, binary, vendored or build output. Don't open or search them:
`node_modules/`, `dist/`, `.next/`, `.vinext/`, `.wrangler/`, `outputs/`, `work/`,
`package-lock.json`, `*.tsbuildinfo`, `lib/rite/bank-data.ts` (generated, ~50 KB;
`node --experimental-strip-types scripts/generate-rite-bank.mjs`),
`ios/Fearville/{glossary,roles,tutorials}.json` (generated by
`scripts/generate-ios-reference.mjs`), `drizzle/meta/`, `docs/design/*.png`,
`docs/design/*.svg`, `artifacts/`, `Claude outputs/`, `public/*.png`, `public/fonts/`.

Screenshots in `artifacts/` and `Claude outputs/` are local-only and ignored by
Git. Preserve local copies before pulling the housekeeping change; the original
authoring checkout retains them. Do not commit generated screenshots again.
