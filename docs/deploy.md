# Hosting and deploys

**Today:** Fearville runs on ChatGPT Sites hosting (`@openai/sites-vite-plugin`, `.openai/hosting.json`) at https://fearville.app, with D1 bound as `DB`. Server variables (Google/Apple credentials) are installed in the hosting environment and need a republish; see [account-setup.md](account-setup.md).

**Planned:** Art's own Cloudflare account with a GameTable Durable Object per table (Jira epic FEAR-78), a staging server at staging.fearville.app (FEAR-105), and deploys that run only in GitHub Actions: staging on merge to `main`, production after approval (FEAR-107).

## Rules

Own-account build configuration and durable-data transfer are documented in [cloudflare-deploy.md](cloudflare-deploy.md), supplied by FEAR-83. Preserve GitHub's production environment approval and branch protection rules.

- Agents and local machines never deploy. Deploys run in CI only.
- Migrations in `drizzle/` are **additive only** (new tables, new nullable columns). A destructive change needs two deploys: first stop reading/writing the old field, then remove it in a later release.
- `npm run build` produces `dist/`; don't commit it.

## Deploying during live games (FEAR-121)

- **Open pages**: every API response carries `X-Fearville-Build`, and the table socket's `hello` frame carries `buildId` and `apiVersion`. A page on an older build reloads right away when it isn't in a game (no table, lobby, finished game). Mid-game it reloads at the next phase change while the player isn't mid-action (no request in flight, not typing), showing "Updating…". Seats survive the reload. A reload happens at most once per build per tab, so a cached bundle can't cause a loop.
- **Protocol bumps**: raise `TABLE_API_VERSION` (`lib/game/socket-protocol.ts`) only for incompatible table protocol changes; clients on another version reload immediately, saving the text field being typed.
- **Stored state**: games carry `schemaVersion`. `lib/game/saved-state.ts` migrates older versions forward with pure functions (`MIGRATIONS`, tested in `tests/saved-state.test.ts`). New code must read the previous version; never write a version the previous release can't read without a protocol bump.
- **Durable Objects** restart on deploy: in-memory state reloads from object storage, alarms persist and sockets reconnect through the normal reconnect path. `tests/deploy-integration.mjs` restarts the runtime with a new `BUILD_ID` mid-game and checks every player's state.
