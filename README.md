# Fearville

Own-account Cloudflare configuration and durable-data transfer: [Deploy](docs/cloudflare-deploy.md). Deployments run through CI only.

A text-only, in-person game companion: a web app, shared Cloudflare Worker/D1 backend, and native SwiftUI iPhone client. Both clients use the same server-authoritative rules and action forms.

Horrors of Fearville (default) and Holy Moon and Stars support 5–18 players. The Storyteller runs the game; players use their phones at the table.

## Quick start

```sh
npm ci
npm run dev        # local setup and database: docs/setup.md
npm run check      # typecheck + lint + unit tests
```

## Docs

- [docs/setup.md](docs/setup.md): run locally with local D1
- [docs/testing.md](docs/testing.md): test commands, integration runner, CI
- [docs/deploy.md](docs/deploy.md): hosting and deploys
- [docs/mobile.md](docs/mobile.md): iOS and TestFlight
- [docs/account-setup.md](docs/account-setup.md): Google and Apple sign-in
- [docs/social-system.md](docs/social-system.md): progression, Elo, stats, privacy
- [docs/features.md](docs/features.md): sessions, scripts, tutorials, social, hub
- [docs/night-rite.md](docs/night-rite.md): Night Rite puzzles
- [docs/admin-runbook.md](docs/admin-runbook.md): admin access, console, audit and live text
- [docs/staging.md](docs/staging.md): staging.fearville.app, isolated test data and sign-in setup
- [docs/deploy-pipeline.md](docs/deploy-pipeline.md): CI-only staging deployment, approved production and rollback
- [AGENTS.md](AGENTS.md): repo map and rules for coding agents
