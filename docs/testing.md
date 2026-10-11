# Testing

Agents run `npm run check` and targeted unit files only. CI (`.github/workflows/ci.yml`) runs the full suite on every PR.

```sh
npm run check                              # typecheck + lint + unit tests (fast; run this)
npm run test:unit -- tests/rite.test.ts    # one unit test file
npm run test:integration                   # build, migrate local D1, run every HTTP suite
npm run test:integration -- rite social    # only suites whose name matches
npm test                                   # unit + integration
```

`npm run test:integration` builds the worker, applies `drizzle/*.sql` to local D1, starts the compiled worker on a free port and runs each suite with `CT_TEST_URL`. Failing suites print their first 30 lines; full logs go to `work/integration-logs/`. Suites in `tests/integration-known-failures.json` fail on main for documented reasons and are reported as KNOWN without failing the run. Integration tests create test sessions and fixture accounts in the local database. They test simultaneous joins and votes, privacy, authorization, timer advancement, recovery, account scoping, and the whole social flow (handles, friend requests, invitations, recorded results, ratings, rewind withdrawal, and deletion). The social suite sends many requests; if a run trips the per-minute rate limit, wait for the next minute and run it again.

For API verification on Windows, build first and run `node scripts/local-api-test-server.mjs`. This serves the compiled worker directly at `http://127.0.0.1:3001`, avoiding development proxy restarts. Set `CT_TEST_URL` to that URL when running HTTP suites (`$env:CT_TEST_URL='http://127.0.0.1:3001'` in PowerShell). The fixture database stays local. Use the normal development server for browser checks.

## Validation history

- FEAR-4 verification: 130 unit tests, TypeScript, app/domain oxlint, production build, and all 13 HTTP suites passed. Native unsigned simulator CI passed on the refactor branch. Browser checks at 400px and 1280px covered inline definitions, keyboard opening, Escape/focus restoration, outside/reclick dismissal, avatar settings, and retained death-effect previews. Screenshots are in `artifacts/fear4/`. Native reference data are regenerated with `node --experimental-strip-types scripts/generate-ios-reference.mjs`; tests enforce glossary parity.

- Role assignment and rejoin updates: all 42 unit tests passed, including random setup validation across 5–18 players. Session integration checks passed for preview consistency, manual edits, same-device rejoin, cross-browser recovery, preserved Storyteller permissions, and impersonation rejection. Mobile browser automation verified both users returning after browser closure, both recovery forms, and the Storyteller’s random/manual controls at 320px width. Physical iPhone/Safari checks remain outstanding.
- 18 engine tests, 7 account cryptography tests, and 6 social result-derivation tests passed.
- Multi-client API integration tests (session, accounts, social) passed against the local D1-backed server.
- TypeScript checking, app/domain lint, and the production build passed.
- `npm run lint` covers `app lib components db tests`; the unmodified starter catalog in `components/ui` is excluded in `.oxlintrc.json`.

