# Fearville mobile shells

Capacitor 8.5.3 loads the hosted site (`server.url`) with a bundled error page (`server.errorPath`), following `docs/mobile-shell-decision.md`. The iOS shell is checked in under `ios/App/` (FEAR-94); Android remains the FEAR-93 prototype until FEAR-95.

The staging site must include the adapter from this branch (`lib/native/capacitor.ts`, mounted by `components/native-shell.tsx`) and the exchange cookie change.

## Android (Windows is fine)

Needs Node 22 and Android Studio. Plug in a phone with USB debugging on, or use an emulator.

```sh
cd mobile
npm install
npx cap add android
npm run sync            # writes www/site.js, copies config; FEARVILLE_URL=... to change site
npx cap open android    # then Run ▶ on your phone
```

Before running, add the sign-in return intent to the `<activity>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="fearville" android:host="signin" />
</intent-filter>
```

## iOS (FEAR-94)

Requires Node 22+, Xcode 26+, and an iPhone running iOS 17+. The project is
already checked in: do **not** run `cap add ios` again.

```sh
cd mobile
npm ci
npm run sync:ios
npm run ios
```

Choose **Fearville-Staging** for testers, or **Fearville** for production archives.
Both schemes use the App target, iPhone only, portrait, dark appearance, and a
light status bar. Debug is a development build of staging.

| Configuration | Site | Bundle ID | Display name / icon |
|---|---|---|---|
| Debug / Staging | `https://staging.fearville.app` | `app.fearville.staging` | Fearville β / BETA badge |
| Release | `https://fearville.app` | `app.fearville` | Fearville / original icon |

Apple Team ID: `TV2PQGFFGU`. Registered identifiers are in
`ios/App/Config/Identity.xcconfig`, confirmed by Art for FEAR-115. Automatic
signing uses this team. Provisioning profiles must include Associated Domains.
No signing keys, profiles, or credentials belong in Git.

`MARKETING_VERSION` owns the app version. CI supplies
`CURRENT_PROJECT_VERSION` as an increasing build number (local default: 1).
The **Prepare shell environment** Xcode phase writes configuration-specific
resources into DerivedData. It overrides `server.url`, the app identity, and
`public/site.js` together, so a Release archive cannot accidentally retain the
staging URL or Retry target from the preceding `cap sync`. `FEARVILLE_URL` is
still available for the Android prototype; it does not override iOS build
configurations. Re-run `sync:ios` after changing plugins or bundled web assets.

`FearvilleBridgeViewController` registers `FearvilleAuth` and the navigation
policy plugin. SceneDelegate instantiates this controller and handles both
cold-launch and resumed Universal Links. Google uses
`ASWebAuthenticationSession`, which captures `fearville://signin` directly;
no custom URL Type is needed. The existing web adapter exchanges the code
same-origin, and the server sets the HttpOnly `ct_account` cookie.

The Worker serves `/.well-known/apple-app-site-association` as JSON without a
redirect. Each host associates only its own bundle ID, for `/table?code=…` and
`/friends` (the current friend-request/game-invite inbox). Both the association
and the native URL policy exclude privacy, store, and unrelated routes. The
native policy sends `/privacy`, `/store`, and external web links (including
Stripe) to the system browser, and rejects lookalike hosts as app origins.
Staging links never load the production database inside the staging shell.
Deploy the association through the normal Worker release process before testing
Universal Links. Apple caches the association, so installation/reinstallation
may be needed after a change.

Icon, Fearville logo, and Metal Mania font assets were preserved from the
retired SwiftUI app. The offline page includes the same logo/font and OFL license. The privacy
manifest preserves the existing data inventory and adds the app-owned
UserDefaults access used by Capacitor for its binary version and resource path
(`CA92.1`). No analytics or tracking SDK was added.

### Validation and remaining release work

`.github/workflows/mobile-ios.yml` validates the URL policy, compiles unsigned
Staging and Release simulator apps, and checks their actual bundled settings and
resources, including the font license. It replaces the retired SwiftUI workflow
(`ios.yml`); it does not upload an IPA.

Signed upload and TestFlight automation belong to **FEAR-108**, signing secrets
to **FEAR-109**, and native Sign in with Apple to **FEAR-117**. This shell alone
does not satisfy FEAR-94's full TestFlight/Apple-sign-in acceptance criterion.
No device results have been claimed by the coding agent.

On a physical device, record the following on **FEAR-94**, including the commit,
app version/build, iPhone/iOS version, environment, and pass/fail evidence:

- Run the three FEAR-93 checks below: bridge/haptics, Google sign-in with a
  persisted signed-in WebView, and airplane-mode launch followed by Retry.
- Install Staging from TestFlight; verify the β name/BETA icon and staging URL.
- Tap a table invitation and a `/friends` link from Notes/Messages with the app
  terminated, then while it is running. Confirm the correct environment opens
  and a table can be joined. Cross-environment links must not load in the shell.
- Confirm privacy, store, and a Stripe destination open in the system browser.
- Check launch, safe areas, status bar, keyboard, and portrait layout on a notched
  iPhone; play a full game, including background/resume.
- Repeat the Google check after relaunch; complete Apple sign-in once FEAR-117
  lands. Exercise the offline screen during an interrupted navigation as well
  as a cold launch.

## Checks

Open the WebView console: `chrome://inspect` on the PC for Android, Safari → Develop for iOS. For iOS console checks, use the Debug configuration, which loads staging and enables the inspector. Staging/TestFlight and Release disable WebView inspection and native bridge logging.

1. **Plugins.** `FearvilleNative.capabilities` lists `haptics`, `share`, `keepAwake`, `lifecycle` and `auth`. `FearvilleNative.call('haptics.play', {kind: 'tap'})` buzzes.
2. **Google sign-in.** Paste into the console:
   ```js
   const v = crypto.randomUUID() + crypto.randomUUID();
   const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
   const c = btoa(String.fromCharCode(...d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
   addEventListener('fearville:native', async (e) => {
     if (e.detail.type !== 'signin') return;
     const r = await fetch('/api/accounts/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: e.detail.code, verifier: v }) });
     console.log('exchange', r.status, (await (await fetch('/api/accounts')).json()).account);
   });
   const s = await (await fetch('/api/accounts/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google', nativeChallenge: c }) })).json();
   FearvilleNative.call('auth.open', { url: s.url });
   ```
   Complete Google sign-in. The console should print `exchange 200` and your account. That shows the cookie signed the WebView in.
3. **Offline.** Turn on airplane mode and launch the app. "Can't reach Fearville" and Retry appear. Turn the network back on and tap Retry: staging loads.

Record results on FEAR-93 (Android) or FEAR-94 (iOS).
