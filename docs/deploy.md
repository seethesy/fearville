# Hosting and deploys

**Today:** Fearville runs on ChatGPT Sites hosting (`@openai/sites-vite-plugin`, `.openai/hosting.json`) at https://fearville.app, with D1 bound as `DB`. Server variables (Google/Apple credentials) are installed in the hosting environment and need a republish; see [account-setup.md](account-setup.md).

**Planned:** Art's own Cloudflare account with a GameTable Durable Object per table (Jira epic FEAR-78), a staging server at staging.fearville.app (FEAR-105), and deploys that run only in GitHub Actions: staging on merge to `main`, production after approval (FEAR-107).

## Rules

Own-account build configuration and durable-data transfer are documented in [cloudflare-deploy.md](cloudflare-deploy.md), supplied by FEAR-83. Preserve GitHub's production environment approval and branch protection rules.

- Agents and local machines never deploy. Deploys run in CI only.
- Migrations in `drizzle/` are **additive only** (new tables, new nullable columns). A destructive change needs two deploys: first stop reading/writing the old field, then remove it in a later release.
- `npm run build` produces `dist/`; don't commit it.
