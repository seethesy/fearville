# FEAR-106 — staging sign-in setup

Use these values once the staging Worker is deployed. The staging code uses a separate canonical origin and database; keep the existing production configuration in place.

## Google

1. Open the [Google Auth Platform Clients page](https://console.cloud.google.com/auth/clients) in the Fearville Google Cloud project. Prefer a separate **Web application** client for staging.
2. Add the authorized redirect URI exactly: `https://staging.fearville.app/api/accounts/callback/google` (no trailing slash). If the client asks for a JavaScript origin, use `https://staging.fearville.app`.
3. Save the client ID and secret in your password manager. If the consent app is in Testing, add the intended testers, including `sybertechlabs@gmail.com`, under Audience/Test users.

[Google's web OAuth setup and redirect requirements](https://developers.google.com/identity/protocols/oauth2/web-server).

## Apple

1. Open Apple Developer → Certificates, Identifiers & Profiles → Identifiers. Select the web **Services ID** associated with the Fearville primary App ID that has Sign in with Apple enabled.
2. Under Sign in with Apple → Configure, add domain `staging.fearville.app` and Return URL `https://staging.fearville.app/api/accounts/callback/apple`. Keep the production domain/return URL.
3. Save the Services ID, Team ID, Key ID and existing Sign in with Apple private key in your password manager. If no suitable key exists, create one for the primary App ID and store the `.p8` file securely.

[Apple's web configuration steps](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web).

## Staging Worker settings

Open Cloudflare → Workers & Pages → **fearville-staging** → Settings → Variables and Secrets. Set these as **secrets**:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Staging OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | That client's secret |
| `APPLE_SERVICES_ID` | Apple web Services ID |
| `APPLE_TEAM_ID` | Developer Team ID |
| `APPLE_KEY_ID` | Sign in with Apple signing Key ID |
| `APPLE_PRIVATE_KEY` | Complete PEM contents of the `.p8` key |
| `AUTH_ENCRYPTION_KEY` | A new random 32-byte base64url value dedicated to staging; retain it across redeploys |

`ADMIN_EMAIL_ALLOWLIST=sybertechlabs@gmail.com`, `APP_ORIGIN=https://staging.fearville.app` and `ENVIRONMENT=staging` are server runtime configuration supplied by the staging code/workflow. Do not put OAuth values in public/client variables or paste them into this chat.

Generate `AUTH_ENCRYPTION_KEY` on your own computer with Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copy the output directly into Cloudflare and your password manager. Keep the `.p8` PEM header/footer and line breaks when setting `APPLE_PRIVATE_KEY`.

Save/deploy the Worker settings in Cloudflare. The GitHub deployment workflow preserves existing Worker secrets; it does not sync OAuth secrets from GitHub. Configure these seven values on the staging Worker itself.

[Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## App Review sign-in (TestFlight, staging only)

Apple's Beta App Review needs a username and password, but Fearville signs in with Google or Apple only. A small form on the sign-in panel ("App Review sign-in") signs in one synthetic, non-admin account (`app_reviewer`, email `review-signin@example.invalid`) when the staging Worker has both secrets below. Without them the form is hidden and `POST /api/accounts/review` returns 404. It never works in production or local runs, and it is rate limited to 5 attempts a minute per IP.

Set both as **secrets** on the `fearville-staging` Worker (Cloudflare → Workers & Pages → fearville-staging → Settings → Variables and Secrets, or `npx wrangler secret put NAME --env staging`):

| Name | Value |
|---|---|
| `REVIEW_LOGIN_USERNAME` | At least 3 characters, for example `app-review` |
| `REVIEW_LOGIN_PASSWORD` | At least 16 random characters from your password manager |

Put the same two values in App Store Connect → TestFlight → Test Information → Sign-in required. Remove both secrets to turn the form off. If a reviewer deletes the account, the next sign-in recreates it.

## Acceptance

1. Confirm the custom domain is attached to `fearville-staging`; use the Worker custom-domain configuration rather than manually replacing the production DNS record.
2. Visit [staging.fearville.app](https://staging.fearville.app) and confirm the STAGING label.
3. Sign in with Google as `sybertechlabs@gmail.com`: the admin console should appear. Sign out, then exercise ordinary Google and Apple sign-in with a player account; the admin account uses Google only.
4. In GitHub → Actions → **Seed staging** → Run workflow, select `main`. The workflow creates six synthetic profiles (`stage_qa_storyteller`, `stage_qa_player_1` through `stage_qa_player_5`), friendships and three finished games. Re-running it is safe. Synthetic profiles have no sign-in credentials; use a real Google/Apple account to sign in, then inspect the fixtures through profiles or the admin console.
5. Verify the real staging account and the `staging-fixture-host` seed marker are absent from the production D1 database.

FEAR-106 remains open until both provider sign-ins and seeded staging data are verified.
