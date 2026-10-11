# Mobile shell decision (FEAR-93)

**Status:** proposed. Art approves this before FEAR-94/95 start. The three checks at the end must pass on real devices first.

## Decision

Use **Capacitor**, with option **(b): a small bundled start page that navigates to the hosted site**. The shell owns the native features and exposes them to the web app as `window.FearvilleNative` (the FEAR-96 contract) through one thin adapter script. If check 1 below fails, fall back to **(a) `server.url`**. If neither keeps plugin access on the hosted origin, fall back to **(c) a custom shell**.

## Why

| | (a) Capacitor `server.url` | (b) bundled start page → hosted site | (c) custom WKWebView / Android WebView |
|---|---|---|---|
| Loads the server-rendered app | Yes, directly | Yes, after the local page navigates | Yes |
| Plugins on the hosted origin | Yes: Capacitor treats that URL as the app origin | Must be proven (check 1); origin listed in `server.allowNavigation` | Yes, via our own script message handler |
| Offline / error screen | Only the WebView's own error, plus `server.errorPath` if available | Local page shows "Can't reach Fearville. Retry." before and after navigation | Our own |
| Capacitor's guidance | Docs describe `server.url` for live reload, not production | Supported pattern | n/a |
| Native code to own | Least (official/community plugins) | Least, plus ~100 lines for the adapter and start page | Most: every bridge method, push, purchases, lifecycle, written twice |
| Token cost for Codex/Claude | Low | Low | High, and permanent upkeep |

Option (b) keeps (a)'s low native cost and avoids relying on a setting meant for development. It also gives a real local first screen, which helps with review and offline handling. Option (c) costs the most in exactly the area we're trying to cut (native code on two platforms) and gives up a maintained plugin ecosystem.

## How it works

- **Loading:** `capacitor://localhost/index.html` (bundled) checks reachability, then `location.replace('https://fearville.app/')`. `server.allowNavigation: ['fearville.app', 'staging.fearville.app']` keeps navigation inside the WebView. Any other origin opens in the system browser.
- **Bridge:** the adapter maps `FearvilleNative.call(method, args)` to plugins and re-dispatches app events as `fearville:native` events:
  - `@capacitor/haptics`, `@capacitor/share`, `@capacitor/app` (lifecycle, deep links), `@capacitor/network`
  - `@capacitor-community/keep-awake`
  - a Keychain/Keystore secure-storage plugin
  - `@capacitor/push-notifications`
  - purchases: StoreKit / Play Billing behind the same bridge (FEAR-76)

  The web app only ever checks `capabilities`, so older builds keep working.
- **Detection:** `isNativeShell()` and `capabilities()` from `lib/native/bridge.ts`. No user-agent sniffing.
- **Sign-in:** Google blocks OAuth inside embedded WebViews, so sign-in never runs in the WebView.
  1. The web app starts the flow with a PKCE `nativeChallenge` (`/api/accounts/start`).
  2. The shell opens it in `ASWebAuthenticationSession` (iOS) or Custom Tabs (Android).
  3. The callback redirects to `fearville://signin?code=…` (already implemented in `lib/accounts/callback.ts`), and `@capacitor/app` delivers it to the web layer.
  4. The web layer calls `/api/accounts/exchange` same-origin.
  5. **Needed change:** the exchange must also set the `ct_account` cookie when it is called same-origin. Today it returns only `accountToken`.
  6. The shell also stores the token in secure storage, so a cleared WebView data store can sign back in silently.
  7. Sign in with Apple uses the native Apple sheet on iOS.
- **Deep links:** Universal Links / App Links for `https://fearville.app/?join=<code>` (the FEAR-96 invite link) open the app, with `fearville://` kept for sign-in.

## App Store 4.2 (minimum functionality)

A wrapped website is the classic 4.2 rejection. Our case to the reviewer rests on features a website can't do:
- Sign in with Apple
- StoreKit purchases
- push notifications for turns, night and invites
- haptics
- keep-awake during play
- native share sheet
- an offline screen
- the silent-switch-aware audio

Make the review notes and screenshots show these. Ship push and Sign in with Apple in the **first** TestFlight build that goes to review. **Risk: medium.** It drops once push and IAP are in.

## Risks

1. Plugin access after navigating to a remote origin (option b) has been unreliable in some Capacitor versions and differs by platform. That is check 1, with (a) as the fallback.
2. WKWebView storage and service workers: keep the site working without a service worker in the shell. If one is added later, it needs App-Bound Domains.
3. The cookie handoff after native sign-in needs the small server change above.
4. A bad deploy breaks every app at once (no bundled web build). This is mitigated by the local error page and by staging.

## Checks before approval (prototype in `mobile/`)

1. On **both** platforms, after the start page navigates to staging, `window.FearvilleNative.capabilities` is present and `haptics.play` buzzes.
2. Google sign-in completes through `ASWebAuthenticationSession` / Custom Tabs → `fearville://` → exchange, and the WebView is signed in.
3. Airplane mode at launch shows the local "Can't reach Fearville" page, and Retry recovers.

These have **not** been run: this work had no Mac, Xcode or Android SDK. `mobile/README.md` has the commands to run them.
