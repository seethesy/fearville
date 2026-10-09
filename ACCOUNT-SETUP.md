# Fearville: Google and Apple sign-in setup

Updated September 8, 2026. The provider integrations are implemented; sign-in becomes available after the credentials are installed on the server. Creating credentials in a provider console does not activate the app by itself.

## Copy these exact values

| Field | Value |
|---|---|
| App name | Fearville |
| Website / homepage | https://fearville.phatsyloaf.chatgpt.site |
| Privacy policy | https://fearville.phatsyloaf.chatgpt.site/privacy |
| Google authorized redirect URI | https://fearville.phatsyloaf.chatgpt.site/api/accounts/callback/google |
| Apple domain / subdomain | fearville.phatsyloaf.chatgpt.site |
| Apple return URL | https://fearville.phatsyloaf.chatgpt.site/api/accounts/callback/apple |

Copy callback URLs without spaces or a trailing slash. The Google and Apple paths are different. This guide uses the current English console labels from the linked official documentation; a wizard may omit a step you have already completed.

## 1. Set up Google

### A. Select a project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in to the Google account that will manage Fearville.
2. Use the project selector in the top bar. Select an existing Fearville project, or choose **New Project**, name it **Fearville**, and click **Create**. If prompted for an organization/location, use the one appropriate to your account.
3. Select that project after creation. Keep it selected throughout these steps.
4. Open the navigation menu and choose **Google Auth Platform**. If it is hard to find, use the console search box to search for that name.

### B. Create the consent configuration

1. Open **Branding**. On an unconfigured project, click **Get Started**.
2. Under **App Information**, enter **Fearville** for the name and select your monitored support email. Click **Next**.
3. Under **Audience**, select **External** so players outside your own organization can sign in. Click **Next**.
4. Enter your email in **Contact Information** and continue.
5. Review the policy acknowledgement, accept if you agree, then click **Continue** and **Create**.
6. Open **Audience** in the left sidebar. While testing, use **Test users → Add users**, enter your own Google email and your testers' emails, then **Save**.
7. Open **Data Access → Add or Remove Scopes**. Select only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile`. Save the selection. Fearville requests the equivalent short scopes `openid email profile`; it does not need Gmail, Drive, or Contacts permissions.

[Google's consent configuration instructions](https://developers.google.com/workspace/guides/configure-oauth-consent)

### C. Set branding links and check domain requirements

1. Return to **Branding**. Under **App Domain**, use the homepage and privacy URLs in the table above. Save the form.
2. If **Authorized domains** is required, use **Add domain** and supply the domain Google accepts for this hosted address, without `https://` or a path. Start with `fearville.phatsyloaf.chatgpt.site`; Google may require its registrable parent instead.
3. If Google rejects the domain or requests ownership verification you cannot complete, stop at that error. Do not claim ownership of `chatgpt.site`. Send me the error text; production verification may require a domain you control and a hosting configuration that supports it.
4. For public production branding, review **Verify Branding** / **View issues** if shown. Google requires verified ownership for the homepage domain and may require additional links, including terms. Fearville currently has a privacy page, but no terms page. Do not enter a nonexistent terms URL. Complete those requirements before publishing branding.

[Google's branding and domain requirements](https://support.google.com/cloud/answer/15549049?hl=en)

### D. Create the Google client

1. In Google Auth Platform, click **Clients → Create client**.
2. Choose **Web application** for application type. Name it **Fearville web and iOS backend**.
3. Leave **Authorized JavaScript origins** empty for this implementation: the backend handles the code exchange. This is not a Google JavaScript SDK integration.
4. Under **Authorized redirect URIs**, click **Add URI** and paste:

   `https://fearville.phatsyloaf.chatgpt.site/api/accounts/callback/google`

5. Click **Create**. Save the **Client ID** and **Client secret** securely when displayed. Use **Download JSON** if offered; save the file outside the source repository.
6. If the secret is no longer visible and you did not save it, open **Clients → your client** and use **Add Secret** to create and securely save a replacement. Do not delete working credentials as part of setup.

[Google's client creation instructions](https://support.google.com/cloud/answer/15549257?hl=en)

For this app, the same confidential web client serves the website and the system-browser sign-in flow on iPhone. A separate Google iOS client is not consumed by the current code. The client secret never goes in Xcode.

## 2. Set up Apple

Use your paid Apple Developer account. Account Holder or Admin access is needed for the identifier/key operations below.

### A. Register the iPhone App ID

1. Open [Apple Developer Account](https://developer.apple.com/account/), sign in, and choose the correct team if you have several.
2. Open **Certificates, Identifiers & Profiles → Identifiers**.
3. Click **+**, choose **App IDs**, and continue. Choose **App** if an app-type choice appears.
4. Set **Description** to **Fearville**. Choose an **Explicit** Bundle ID that is unique to you, for example `com.yourorganization.fearville`. Replace `yourorganization`; this example is not a registered identifier.
5. Enable **Sign in with Apple** in the capabilities list. Continue through the review and registration controls.
6. Record the exact Bundle ID. If you already registered Fearville, open that identifier and edit its capabilities instead of creating another one.

[Apple's App ID instructions](https://developer.apple.com/help/account/identifiers/register-an-app-id/)

In the App ID's **Sign in with Apple → Configure/Edit** settings, classify Fearville as the primary App ID when that choice is presented, then save. The Services ID and sign-in key below must be associated with this same primary app. [Apple's primary-app prerequisite](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/)

### B. Register the web Services ID

1. Return to **Identifiers** and click **+**.
2. Select **Services IDs → Continue**.
3. Enter **Fearville Web Sign-In** as the description.
4. Enter a distinct reverse-domain identifier, for example `com.yourorganization.fearville.web`. This must differ from the iPhone Bundle ID.
5. Click **Continue**, review, and **Register**.
6. Record this identifier as `APPLE_SERVICES_ID`.

[Apple's Services ID instructions](https://developer.apple.com/help/account/identifiers/register-a-services-id/)

### C. Add the website and callback

1. In **Identifiers**, use the type filter to select **Services IDs**, then open **Fearville Web Sign-In**.
2. Enable **Sign in with Apple** and click **Configure**.
3. Select Fearville under **Primary App ID**.
4. In the website configuration, enter **Domains and Subdomains**:

   `fearville.phatsyloaf.chatgpt.site`

5. Enter **Return URLs**:

   `https://fearville.phatsyloaf.chatgpt.site/api/accounts/callback/apple`

6. Click **Done**, then **Continue**, then **Save**. Reopen the configuration and check both values were saved.

The domain field has no scheme or path. The return URL includes both. Apple's current web setup does not require a domain-verification file uploaded to the server. [Apple's web configuration instructions](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)

### D. Create the Apple sign-in key

1. In **Certificates, Identifiers & Profiles**, click **Keys → +**.
2. Enter **Fearville Sign In** as the key name.
3. Enable **Sign in with Apple**. Open its configuration if requested and select the same primary Fearville App ID.
4. Continue, review, and confirm/register the key.
5. Click **Download**. Save the `AuthKey_....p8` file securely outside the repository. Apple lets you download it only once.
6. Record its **Key ID** from the key details. This becomes `APPLE_KEY_ID`; the file contents become `APPLE_PRIVATE_KEY` on the server.
7. Record your developer **Team ID** from your account's membership details. This becomes `APPLE_TEAM_ID`, not the App Store numeric app ID or the Bundle ID.

[Apple's key creation instructions](https://developer.apple.com/help/account/keys/create-a-private-key/)

### E. Match the Xcode project

1. On your Mac, extract the updated Fearville iOS ZIP and open `Fearville.xcodeproj`.
2. In the left project navigator, click the blue project icon, then select **Fearville** under **TARGETS**.
3. Open **Signing & Capabilities**, select your team, and enable automatic signing. Set **Bundle Identifier** to the exact App ID from section A.
4. Click **+ Capability**, search for **Sign in with Apple**, and add it. [Apple's Xcode guidance](https://developer.apple.com/documentation/xcode/configuring-sign-in-with-apple)
5. Check the target's **Info** settings or `Fearville/Info.plist`: `FearvilleAPIURL` must be `https://fearville.phatsyloaf.chatgpt.site`. The updated project already contains this value.
6. Keep the URL scheme `fearville`. The app uses `fearville://signin` internally to return from its authentication browser. This internal scheme is not the website address, and must not replace Google's or Apple's HTTPS callback.
7. Build and run on your iPhone. A previously built app must be rebuilt to pick up the new backend address. Follow the separate TestFlight guide for archive/upload steps.

## 3. Install the credentials on Fearville's server

These are the exact server variable names expected by the code:

| Variable | Obtain it from |
|---|---|
| `GOOGLE_CLIENT_ID` | Google web client's ID, usually ending in `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Secret saved when creating the Google web client |
| `APPLE_SERVICES_ID` | Web Services ID from Apple section B |
| `APPLE_TEAM_ID` | Apple Developer membership details |
| `APPLE_KEY_ID` | Apple sign-in key details |
| `APPLE_PRIVATE_KEY` | Full `.p8` text, including BEGIN/END lines |
| `AUTH_ENCRYPTION_KEY` | A new 32-byte random key generated for Fearville |

You do not need to manually generate an Apple client-secret JWT. The backend generates it from the Apple fields above. It encrypts stored Apple refresh credentials using `AUTH_ENCRYPTION_KEY`.

The easiest handoff is to save Google's JSON file and Apple's `.p8` locally, then give me their file paths and the Apple Services ID, Team ID, and Key ID. Do not paste the client secret or private-key contents into chat. If the files are on your Mac but this task is running on Windows, transfer them securely to a local folder this task can read first. These paths should not be committed to Git.

I can then install the server variables using the hosting connector and republish. There is no need to guess which hosting settings page is available in your UI. Until that installation happens, Fearville intentionally shows the providers as unavailable.

If preparing the encryption key yourself, run this in a terminal with Node installed:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Save that output securely as `AUTH_ENCRYPTION_KEY`. Preserve it: changing it without migration prevents decryption of existing Apple credentials. Never put any of these secrets in browser code, Swift source, or a `NEXT_PUBLIC_` variable. A local `.env` file does not configure the hosted app.

## 4. Check the completed setup

1. Open the new Fearville website. Each configured provider's button should be available after the server is republished.
2. Sign in with your Google test account. Confirm the Account screen displays your account.
3. Create a game while signed in, then sign in with the same account on a second device and restore the saved seat.
4. While signed in, explicitly connect Apple from Account. Sign out, sign back in with Apple, and check that it restores the same account. Matching email addresses alone do not link accounts.
5. Test Apple Hide My Email, cancellation, and signing in again after the first authorization.
6. On the rebuilt iPhone app, confirm sign-in returns from the system browser to Fearville.
7. With a disposable account, test account deletion. It deletes that account's hosted games too; messages in another Storyteller's game may remain, as explained by the privacy page.

The automated checks do not replace these real-provider and iPhone checks. No provider credentials have been supplied yet, and the iOS project has not been compiled on this Windows host.

## If you already followed the old guide

Keep the same provider credentials. In **Google Auth Platform → Clients → your web client**, change the redirect URI to the new Google callback above and save. Update your Branding homepage/privacy links too. In **Apple Developer → Identifiers → Services IDs → your service → Sign in with Apple → Configure**, update the website domain and Apple return URL, then finish all save steps. Install the updated iPhone build.

Browsers do not transfer sign-in cookies between these hostnames. If you had a guest seat on the old address, use your saved recovery key on the new address. Update bookmarks and shared links; this change does not promise an old-address redirect.

## Common problems

| Symptom | What to check |
|---|---|
| Google `redirect_uri_mismatch` | Correct web client; exact Google callback above; no trailing slash; allow time for Google's settings to propagate. |
| Google domain/branding verification fails | Read **View issues** and the domain requirements in section 1C; provide the exact error before changing domains again. |
| Google access denied during testing | Correct account/project and Audience settings; add your test account if required. |
| Apple `invalid_client` | Services ID, Team ID, Key ID and `.p8` belong together; key is associated with the primary App ID. |
| Apple rejects the return URL | Services ID configuration uses the exact HTTPS Apple callback, not the Google callback or app scheme. |
| Sign-in finishes but iPhone does not reopen | Use the updated build and retain the registered internal URL scheme. |
| Provider buttons remain disabled | Credentials must be installed in the deployed server environment and republished; downloading them alone is insufficient. |
