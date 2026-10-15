# FEAR-31 admin console

## Enable access

Apply all pending D1 migrations in order, including `0009_colossal_wind_dancer.sql` and `0010_immutable_admin_history.sql`, before releasing this server. Use the deployment's existing migration process; do not run the local fixture scripts against production. Migration 0009 adds roles, moderation, session provenance, XP adjustments, item ownership, audit records, UI text versions and one-use confirmations. Migration 0010 makes audit and text history immutable.

Configure the **server-only** runtime variable `ADMIN_EMAIL_ALLOWLIST=sybertechlabs@gmail.com`. Empty or multiple entries disable admin access. Never use a public/client environment variable. Configure Google OAuth as described in [account setup](account-setup.md), then sign in with that exact verified Google address. The validated callback assigns the reserved admin role; clients cannot assign it. Apple authentication and provider linking cannot grant admin access.

Admin sessions last one hour and every admin request rechecks Google provenance, verified email, expiration and the current allowlist. Removing the allowlist disables access on the next request after the runtime configuration takes effect. The reserved account remains excluded from player flows; removal of access does not turn it into a player. Sign out or revoke its account sessions to terminate credentials. Admin API requests are limited to 120 per minute per account/IP through the existing limiter.

The web account boundary and native root present the admin shell instead of player screens. Promotion removes existing participation and player attribution, revokes old credentials, and cancels any hosted active table. Use a separate ordinary account for gameplay.

## Commands

Enter `help` for the authoritative registry and argument syntax. Account arguments accept a username or account ID; lobby arguments accept a session code. Commands target registered accounts, not anonymous guest identities.

| Commands | Behavior |
| --- | --- |
| `inspect <account>` | Account, moderation, progression and owned items |
| `xp give/remove/set <account> <amount>` | Nonnegative XP balance; derived level updates with the existing progression curve |
| `catalog`, `grant/revoke <account> <item>` | Durable ownership from the server catalog; existing free cosmetics remain free |
| `ban <account> [reason]`, `unban <account>` | Ban revokes access and removes table memberships; unban requires a fresh sign-in |
| `mute <account> [minutes]`, `unmute <account>` | Block chat and social communication; omitted duration is indefinite |
| `signout <account>` | Revoke account, seat and pending native sign-in credentials |
| `reset <account>` | Reset XP, Elo and granted items while retaining game history |
| `lobbies`, `lobby <code>` | List up to 100 active tables or inspect a specific table |
| `kick <account> [code]` | Remove from one table or all tables |
| `endgame <code>` | Administrative cancellation without winner rewards |
| `storyteller <code> <account>` | Revoke the prior host's credentials and save a host seat for the replacement account |
| `text history <key>`, `text revert <key> <version>` | Inspect recent versions or publish a previous version as a new version |

Ban, reset and endgame first show the proposed change. Confirmation uses a five-minute, single-use token bound to the admin session, command and previewed state. If the target changes, preview again. The console supports Up/Down command history and retains responses during the session. Privileged accounts cannot be moderation or progression targets.

Removing an active player uses the engine's departed-player semantics, clears pending choices and the current Rite, and invalidates saved rewind snapshots. Removing the host cancels the game. Storyteller transfer removes the incoming account's active player seat if necessary; the new host resumes through saved lobbies. Neutral notices describe administrative intervention without exposing command details.

## Audit and text editing

Successful command mutations and their audit entry commit in the same D1 transaction. Failed audit insertion rolls back the mutation. Accepted command errors and confirmation previews are also recorded. Authentication failures are rejected before command execution. Database triggers prevent updating or deleting audit and text-version rows. Audit filters support action, target and date range, with 100-row pages. Treat audit contents as privileged account data and retain database backups under the normal operational policy.

Enable **Edit text** in the admin shell. Click a registered text sample, edit its value, then save, reset to default, or preview/revert a version. React renders values as plain text in browsers and mobile shells. Named placeholders such as `{count}` must be preserved exactly. Concurrent saves fail with a reload instruction instead of silently replacing another edit. Reset and revert append versions; they never rewrite history. The editor displays the most recent 200 versions; an older known version ID can still be reverted using the console.

The initial registry covers main-menu copy, navigation, lobby/game tab labels, player counts, the footer and walkthrough titles/steps. Rules content, role definitions and arbitrary player-generated text are outside this initial registry. Add stable keys in `lib/ui-text/registry.ts`, wire the shared web UI consumers. Never reuse a retired key; legacy native-specific keys remain reserved for compatibility with saved text versions.

Active web and iPhone clients poll published text every three seconds. Offline clients retain the last loaded values or bundled defaults. The public endpoint exposes only registered current values and version numbers, never audit history or editor identities.

## Moderation queue

The web admin shell lists reports oldest first, with reporter, reported handle/content and table context. Filter by status and page through 100 reports at a time. Dismiss, warn, remove content and suspend require a preview and single-use confirmation. Their report resolution, source-content change/account ban and audit entry share one transaction. Warnings appear in the target account response and web account panel. Review reports within 24 hours. Console equivalents: `reports [status]` and `report <id> <dismiss|warn|remove|suspend> [note]`.

Admin game changes use the split-part store and preserve concurrent-write guards. Saved credentials are rechecked in the same core/chat write, so a revoked request cannot commit after a ban or Storyteller transfer. Audit records omit roles, private notes, night choices and credentials.

## Verification and release checks

Run `npm run check` before committing. CI builds the Worker, runs every HTTP integration suite against isolated D1 and validates the Capacitor shell in `.github/workflows/mobile-ios.yml`. Admin integration uses an ephemeral Miniflare/D1 database with no deployed credentials or test-authentication endpoint; it covers provenance, privilege escalation, expired/revoked sessions, gameplay denial, confirmations, audit rollback, moderation, split-storage controls and text history.

Real Google sign-in and device interaction are exercised on configured staging. Staging OAuth callbacks and provider secrets are handled in FEAR-106. Do not apply local fixture scripts to production.