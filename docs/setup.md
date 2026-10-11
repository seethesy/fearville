# Local setup

Requires Node 22.13 or newer.

```sh
npm ci
# Apply every migration in drizzle/ to local D1, in order (bash):
for f in drizzle/*.sql; do npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file "$f"; done
npm run dev
```

PowerShell: `Get-ChildItem drizzle/*.sql | Sort-Object Name | ForEach-Object { npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file $_.FullName }`. `npm run test:integration` also applies them (already-applied files are skipped).

Open the Local URL printed by the server. Create a session, then join from separate browser profiles or devices. A browser profile holds one session identity; the Storyteller and players need separate profiles/devices. The local development URL is not a remotely accessible production server.

Google and Apple sign-in need provider configuration: see [account-setup.md](account-setup.md). Test commands: [testing.md](testing.md).
