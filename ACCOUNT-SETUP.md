# Google and Apple account setup

The integration is implemented for web and native iOS, but real sign-in is disabled until you configure the provider credentials. Guest session codes work without accounts. No provider credentials are included in this delivery.

## Google

1. Create or select your project in Google Cloud Console. Configure Google Auth Platform branding, audience, and contact information using your own details. Request only `openid email profile`. While the consent app is in testing, add your testers.
2. Create an OAuth client of type **Web application**. This backend exchanges the authorization code for both clients; the iOS app uses the system authentication browser.
3. Register this exact authorized redirect URI:
   `https://clocktower-table.phatsyloaf.chatgpt.site/api/accounts/callback/google`
4. Set the backend variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from this client. The secret belongs only on the server.
5. Complete Google's production publishing/verification steps required for your consent configuration before opening sign-in to everyone. If Google requires ownership verification of the hosting domain and you cannot verify it, use a domain you control and update all origins and callbacks consistently.

## Apple

1. In Apple Developer Certificates, Identifiers & Profiles, register the App ID matching your final Xcode bundle identifier and enable **Sign in with Apple**. Configure it as the primary App ID.
2. Create a **Services ID** for the website and enable Sign in with Apple. Associate it with that primary App ID. The Services ID is a separate identifier from the iOS bundle ID.
3. Register the domain `clocktower-table.phatsyloaf.chatgpt.site` and exact return URL:
   `https://clocktower-table.phatsyloaf.chatgpt.site/api/accounts/callback/apple`
4. Create a Sign in with Apple key associated with the primary App ID. Download its `.p8` file and record its Key ID and your Team ID.
5. Configure `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` on the backend. `APPLE_PRIVATE_KEY` is the full PEM contents of the `.p8` file, including its header and footer. The code also accepts escaped newlines.
6. Generate a separate 32-byte encryption key on your computer:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   Store it as the backend secret `AUTH_ENCRYPTION_KEY`. Preserve it securely: existing Apple refresh tokens cannot be revoked if their encryption key is lost. Do not replace it casually.

Both web and iOS use the Services ID through this backend, so provider identity remains consistent. Add the Sign in with Apple capability to the matching Xcode target. The native project already registers `clocktowertable://signin` for the final app callback; do **not** substitute that for either provider's HTTPS redirect URI.

## Configure the deployed backend

Use the Sites runtime environment-variable settings for Clocktower Table to enter these values securely, then redeploy the saved site version. Never put secrets in browser variables, Swift source, Git, or chat. The checked-in `.env.example` lists the names only. Local files alone do not configure the deployed site. You can provide local credential-file paths for a later configuration task instead of pasting their contents.

The application has a fixed HTTPS origin in `lib/accounts/service.ts`. If changing domain, update that origin, the iOS `ClocktowerAPIURL`, and both providers' registered callbacks together. Use the deployed HTTPS app to validate Apple sign-in; localhost is not its configured return URL.

Website: https://clocktower-table.phatsyloaf.chatgpt.site

Privacy page: https://clocktower-table.phatsyloaf.chatgpt.site/privacy

## Verify after configuration

1. Confirm each configured provider's button becomes available. Sign in with a test account and verify name, account screen, and sign-out.
2. Create or join a game while signed in, then restore the saved seat on another device using the same account.
3. From Account, explicitly connect the other provider. Sign out and sign in with it; verify it opens the same account. Equal email addresses alone do not merge accounts.
4. On an iPhone, verify system-browser sign-in returns to the app, cancellation is handled, and saved-seat recovery works. Test Apple Hide My Email and returning users whose names are no longer supplied.
5. Test account deletion with a disposable account. Deletion revokes the stored Apple credential, removes the account and its hosted games, and removes its seat credentials. Previously shared game messages in another Storyteller's game can remain, as described on the privacy page.

Local automated tests verify token validation, account isolation, seat recovery, one-time native exchange, logout, and deletion using generated fixtures. Actual Google/Apple sign-in and iOS compilation still require your provider configuration and Mac.

## Provider documentation

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Apple web sign-in configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)
