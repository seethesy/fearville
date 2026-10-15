# Testing

Agents run `npm run check` and targeted unit files only. CI (`.github/workflows/ci.yml`) runs the full suite on every PR.

```sh
npm run check                              # typecheck + lint + unit tests (fast; run this)
npm run test:unit -- tests/rite.test.ts    # one unit test file
npm run test:integration                   # build, migrate local D1, run every HTTP suite
npm run test:integration -- rite social    # only suites whose name matches
npm test                                   # unit + integration
```

`npm run test:integration` builds the worker, applies migrations to a fresh temporary local D1 database, starts the compiled worker on a free port and runs each suite with `CT_TEST_URL`. Every failure returns non-zero; there is no known-failure allowlist. Failing suites print their first 30 lines and full logs go to `work/integration-logs/`. The server shuts down and temporary data is removed afterward. Fixtures cover concurrent actions, privacy, authorization, timers, reconnect, accounts and social records. Fast-check logs are saved in `work/check-logs/`.

For API verification on Windows, build first and run `node scripts/local-api-test-server.mjs`. This serves the compiled worker directly at `http://127.0.0.1:3001`, avoiding development proxy restarts. Set `CT_TEST_URL` to that URL when running HTTP suites (`$env:CT_TEST_URL='http://127.0.0.1:3001'` in PowerShell). The fixture database stays local. Use the normal development server for browser checks.

## Validation history

- FEAR-4 verification: 130 unit tests, TypeScript, app/domain oxlint, production build, and all 13 HTTP suites passed. Native unsigned simulator CI passed on the refactor branch. Browser checks at 400px and 1280px covered inline definitions, keyboard opening, Escape/focus restoration, outside/reclick dismissal, avatar settings, and retained death-effect previews. Screenshots are in `artifacts/fear4/`. The separate native reference copies and their parity checks were retired in FEAR-97; mobile shells now load the same web definitions.

- Role assignment and rejoin updates: all 42 unit tests passed, including random setup validation across 5–18 players. Session integration checks passed for preview consistency, manual edits, same-device rejoin, cross-browser recovery, preserved Storyteller permissions, and impersonation rejection. Mobile browser automation verified both users returning after browser closure, both recovery forms, and the Storyteller’s random/manual controls at 320px width. Physical iPhone/Safari checks remain outstanding.
- 18 engine tests, 7 account cryptography tests, and 6 social result-derivation tests passed.
- Multi-client API integration tests (session, accounts, social) passed against the local D1-backed server.
- TypeScript checking, app/domain lint, and the production build passed.
- `npm run lint` covers `app lib components db tests`; the unmodified starter catalog in `components/ui` is excluded in `.oxlintrc.json`.


## Mobile CI cost guards (FEAR-194)

`.github/workflows/mobile-ios.yml` keeps macOS minutes to what needs a Mac:

- **`mobile-static` (Linux)**: compiles `FearvilleURLPolicy.swift` with the shared cases in `mobile/tests/url-policy-cases.json` (also used by the Android shell) and fails the PR on any broken case. Add other non-Xcode checks here.
- **`simulator` (macOS)**: skipped when the only `mobile/` changes are Markdown; superseded pushes cancel the running build; PRs build **Staging** only, `main` and manual runs build Staging + Release.
- **Private-repo cost switch**: while `seethesy/fearville` is public, GitHub-hosted runners (macOS included) are free and the simulator job runs on every PR touching `mobile/`. If the repository becomes private (`github.event.repository.private`), the simulator job runs only on push to `main`, `workflow_dispatch`, or a PR labelled **`ios-ci`** (adding the label starts it). Nothing needs changing when the visibility flips.
