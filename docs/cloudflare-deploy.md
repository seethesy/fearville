# Own-account Cloudflare deployment

Deployments run only through CI (FEAR-107). This PR never deploys or changes DNS. The live Sites project remains `appgprj_6aa01c8cdd5481918e87fb99e4d99696`.

`wrangler.jsonc` defines local development plus separate staging/production Workers, DB bindings, custom domains, nodejs_compat and Drizzle migrations. The staging and production IDs were discovered from the target Cloudflare account in CI. The zero UUID is used only for local development.

## Resolve database IDs in CI

FEAR-82 stores CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in GitHub environment secrets. GitHub cannot reveal their values. Supply them to `node scripts/configure-cloudflare.mjs staging` (or production) in a job bound to that GitHub environment. The helper refreshes the selected binding from the Cloudflare API; optional D1_STAGING_DATABASE_NAME and D1_PRODUCTION_DATABASE_NAME override the default names. Missing databases fail explicitly; the helper never creates databases. Non-secret database names and IDs are saved as a seven-day CI artifact. Credentials and the secret-supplied account ID are excluded from that artifact. Keep the resolved account configuration in the CI checkout.

```sh
npm ci
node scripts/configure-cloudflare.mjs
CLOUDFLARE_ENV=staging npm run build
npx wrangler deploy --env staging --dry-run
```

PowerShell: `$env:CLOUDFLARE_ENV='staging'; npm run build`. Build each environment separately. The Cloudflare Vite plugin emits `dist/server/wrangler.json` for the selected environment and redirects Wrangler to it. Never reuse local or staging artifacts for production. `npm run dev` without CLOUDFLARE_ENV remains local. The Sites plugin is removed; `.openai/hosting.json` identifies the existing source only.

## Migrations and secrets

The flat numbered SQL migrations and Drizzle statement-breakpoint comments work with Wrangler. CI applies `npx wrangler d1 migrations apply DB --remote --env staging --config wrangler.jsonc` before deployment; production substitutes production. Local setup uses `--local` without `--env`. Wrangler tracks migration filenames. Do not replay migrations against the existing Sites schema or edit already applied files.

The account service already reads Worker bindings. Install confidential provider settings as Worker secrets per environment through CI. Public client IDs can be vars or secrets. See `.env.example` for required names and purposes. Preserve AUTH_ENCRYPTION_KEY when moving encrypted identity refresh tokens. Configure Google/Apple callback URLs separately for each environment's origin.

## Durable-data transfer

With direct source-account D1 access, export a consistent Wrangler snapshot, then retain accounts, identities (encrypted tokens), profiles, settings, friendships, finished games/players, ratings and tutorial progress:

```sh
node scripts/export-d1.mjs --database DB --mode local --file /private/export.json --persist-to /private/source
node scripts/import-d1.mjs --database DB --mode local --file /private/export.json --persist-to /private/target
```

For remote transfer use `--mode remote`, the source owner's `--config` and credentials, and target `--env production`. Export refuses overwrite. Import requires migrated, empty durable tables and refuses merges. Keep snapshots private and outside Git; remove them after verification. Verify row counts and contents before cutover. A failed import can leave a partial target: restore/recreate the empty target before retrying.

Live sessions, snapshots, members, account-seat links, invites, ranked locks, login sessions, OAuth flows, native codes and rate limits are excluded. Players sign in again and create new lobbies. `node tests/d1-transfer-integration.mjs` verifies all nine durable tables through two local D1 copies, exclusions and nonempty-target rejection.

### Sites source access limit

Sites tools confirm DB and its live schema but only expose paginated viewer rows (25 per page, maximum offset 10000), with possible value truncation. They expose no SQL snapshot, database UUID or source Cloudflare credential. Do not use truncated viewer data as a lossless export. Request a full SQL export from the Sites owner/support, or obtain direct source D1 access. Convert an owner-supplied SQL snapshot with `node scripts/export-d1.mjs --source-sql /private/sites.sql --file /private/export.json`, then use the normal import command. If no export is available, a fresh start requires Art's explicit confirmation. Actual transfer and cutover remain pending; no live data is discarded by this PR.

References: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
