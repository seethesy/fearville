# Mobile shell decision (FEAR-93)

**Status:** approved by Art, 2026-10-12. FEAR-94 (iOS) and FEAR-95 (Android) build on this.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How the shell loads the server-rendered site | **Capacitor 8, option (a):** `server.url` pointed at the hosted site, plus `server.errorPath` for a bundled offline/error page |
| 2 | iOS sign-in browser | **`ASWebAuthenticationSession`** through a small local plugin (`FearvilleAuth`); Android uses **Custom Tabs** (`@capacitor/browser`) |
| 3 | How the WebView becomes signed in after the native-code exchange | **`/api/accounts/exchange` sets the HttpOnly `ct_account` cookie** as well as returning `accountToken` |
| 4 | Device checks before the shell tickets | **Android checks now** (Art, on Windows with Android Studio). **iOS checks move into FEAR-94's acceptance criteria.** |

## Why (a) and not (b) or (c)

All three options run the same hosted site in the platform WebView (WKWebView / Android Chromium WebView), so **runtime performance is the same**. Web↔native calls take about 1 ms in each. What differs:

| | **(a) `server.url` + `errorPath`** ✅ | (b) bundled start page → site | (c) custom WebView shell |
|---|---|---|---|
| Cold start to first screen | Baseline | +150–500 ms (local page, reachability ping, then the real load) | ≈ (a) |
| App size | +3–4 MB | +3–4 MB | +<1 MB |
| Plugins on the hosted origin | Guaranteed: the site is the app origin | Depends on bridge injection after navigating; varies by platform | Guaranteed (own bridge) |
| Offline / error screen | Local page on any load failure | Only at launch | Own, anywhere |
| Settings Capacitor marks "not intended for production" | `server.url` | `allowNavigation` | None |
| Native code to own | Least | Least, plus a start page | Every feature written twice |
| Cost to switch later | (a)↔(b) is a config change | (a)↔(b) is a config change | A rewrite |

The first draft of this doc picked (b) because it "avoided a development-only setting". But Capacitor 8.5 docs label `allowNavigation`, which (b) depends on, "not intended for production" too. Both warnings are about live-reload habits (cleartext, dev servers), not about breaking anything. Once that argument is gone, (a) is simpler, removes the riskiest open check (plugins after navigation), and covers a load failure in the middle of a session. Option (c) costs the most in exactly the area we want to keep small: native code on two platforms.

## How it works

- **Loading:** `server.url` = `https://staging.fearville.app` (staging builds) or `https://fearville.app` (production). Links to any other host open in the system browser, which is Capacitor's default.
- **Offline / errors:** `server.errorPath: 'error.html'` shows the bundled page whenever the site fails to load, with Retry. On Android that page has no plugin access, and it needs none.
- **Bridge:** `lib/native/capacitor.ts` (shipped with the site) maps `window.FearvilleNative.call(method, args)` to plugins and re-dispatches app events as `fearville:native` events. It covers the FEAR-96 contract:
  - `@capacitor/haptics`, `@capacitor/share`, `@capacitor/app` (lifecycle, deep links) and `@capacitor/network`
  - `@capacitor-community/keep-awake`
  - secure storage (plugin chosen in FEAR-94/95)
  - push (`@capacitor/push-notifications`) and purchases (FEAR-76), behind the same bridge later

  The web app only checks `capabilities`, so older app builds keep working.
- **Detection:** `isNativeShell()` / `capabilities()` from `lib/native/bridge.ts`. No user-agent sniffing.
- **Sign-in:** never inside the WebView.
  1. The web app calls `/api/accounts/start` with a PKCE `nativeChallenge`.
  2. It calls `FearvilleNative.call('auth.open', { url })`.
  3. **iOS:** `FearvilleAuth.start` runs `ASWebAuthenticationSession` (callback scheme `fearville`, shares Safari cookies) and resolves with the `fearville://signin?code=…` URL. **Android:** Custom Tabs open, and the `fearville://signin` intent arrives through `@capacitor/app`'s `appUrlOpen`.
  4. Either way the web layer receives `{type: 'signin', code}` and POSTs `/api/accounts/exchange` same-origin.
  5. The response sets the HttpOnly `ct_account` cookie, so the WebView is signed in and page scripts never see the token. *(Implemented in this PR.)*
  6. Sign in with Apple uses the native Apple sheet on iOS (FEAR-94).
- **Deep links:** Universal Links / App Links for invite URLs (FEAR-94/95). The `fearville://` scheme stays for sign-in.

## App Store 4.2 (minimum functionality)

A wrapped website is the classic 4.2 rejection. The case to the reviewer rests on features a website can't do:
- Sign in with Apple
- StoreKit purchases
- push for turns, night and invites
- haptics
- keep-awake during play
- the native share sheet
- an offline screen

The first TestFlight build sent to review should include push and Sign in with Apple, and the review notes and screenshots should show them. **Risk: medium**, dropping once push and IAP ship. Option (a) vs (b) makes no difference to 4.2.

## Risks

1. **A bad deploy breaks every app at once** (no bundled web build). Mitigated by staging builds, the error page and Worker rollbacks.
2. **Capacitor changes `server.url` behaviour.** It is widely used in production. If it ever breaks, (b) is a config change away.
3. **WKWebView storage / service workers:** keep the site working without a service worker in the shell. If one is added, it needs App-Bound Domains.
4. **Custom-scheme hijack on Android:** another app could register `fearville://`. PKCE (the `verifier` never leaves the app) makes a stolen code useless.

## Device checks

Prototype in `mobile/`. Run steps are in `mobile/README.md`.

| Check | Android (now, Art) | iOS (FEAR-94 acceptance) |
|---|---|---|
| 1. On staging, `FearvilleNative.capabilities` is listed and `haptics.play` buzzes | ☐ | ☐ |
| 2. Google sign-in → system sign-in browser → `fearville://` → exchange → WebView signed in | ☐ | ☐ |
| 3. Airplane mode at launch shows the error page; Retry recovers once online | ☐ | ☐ |

If Android check 1 or 2 fails, record it on FEAR-93 before FEAR-95 starts.
