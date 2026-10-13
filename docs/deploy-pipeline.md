# CI deployment and rollback

**Deploy** runs automatically after successful `CI` on the current main commit. It validates that both real `check` and `integration` jobs passed, rejects PR/fork/superseded runs, checks out that exact SHA, and deploys staging. A manual dispatch on main can select a tested main SHA and environment.

The selected job uses its GitHub environment credentials, resolves the D1 binding, sets `BUILD_ID`/`SENTRY_RELEASE`, builds that environment, uploads private browser/Worker source maps to Sentry, removes browser maps from public assets, applies additive migrations, deploys, then checks health, sandbox creation/host resume and multiplayer create/join. Sandboxes intentionally reject live-player joins. Temporary smoke accounts and tables are removed even if a check fails. No test-authentication endpoint is exposed.

Sentry defaults to the FEAR-112 projects `fearville-web` and `fearville-server`. Override `SENTRY_WEB_PROJECT`/`SENTRY_SERVER_PROJECT` as GitHub environment variables if needed. Store `SENTRY_AUTH_TOKEN` and `SENTRY_ORG` per environment. Actual event capture remains FEAR-110; this pipeline prepares release/source-map metadata.

OAuth secrets are maintained directly in the selected Worker under FEAR-106; deployments preserve them. Staging needs a distinct encryption key. Non-secret origin, environment and admin allowlist come from `wrangler.jsonc`.

## Production

Complete FEAR-92's durable-data transfer/callback/cutover prerequisites, then set the GitHub **repository variable** `PRODUCTION_CUTOVER_READY=true`. Manual production deployment requires a tested main SHA that is currently healthy on staging. GitHub's production required-reviewer/protected-branch gate then requires Sean's approval. No tag push automatically deploys production.

Use `/api/health` to inspect build SHA, environment, D1 and the isolated infrastructure Durable Object. The health probe is not the future GameTable backend; live table migration remains FEAR-85.

## Rollback

Run **Rollback** on main, choose staging or production, and optionally enter an existing Cloudflare version UUID; empty selects the previous version. Production retains the same reviewer and cutover gate. Rollback changes code/bindings, retains additive D1 migrations, and verifies health. Never roll back by deleting data or replaying down-migrations.

Wrangler's rollback command restores an existing version. A storage/binding deletion can make old versions incompatible, which is why migrations remain additive and old resource bindings are preserved. [Cloudflare rollback documentation](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

After initial staging deploy: run **Seed staging**, inspect synthetic data, deploy a second tested version, exercise **Rollback** on staging, and restore the intended current version. Keep FEAR-106 open until both real provider sign-ins work.
