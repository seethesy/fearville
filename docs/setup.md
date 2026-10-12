# Local setup

Requires Node 22.13 or newer.

```sh
npm ci
# Apply tracked migrations to local D1:
npx wrangler d1 migrations apply DB --local --config wrangler.local.json
npm run dev
```

The same migration command works in PowerShell. Wrangler records applied filenames; existing databases whose migrations were applied manually need their migration history reconciled before switching to this command. The integration runner always migrates a fresh temporary database and leaves the developer database untouched.

Open the Local URL printed by the server. Create a session, then join from separate browser profiles or devices. A browser profile holds one session identity; the Storyteller and players need separate profiles/devices. The local development URL is not a remotely accessible production server.

Google and Apple sign-in need provider configuration: see [account-setup.md](account-setup.md). Test commands: [testing.md](testing.md).
