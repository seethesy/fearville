# Mobile shell spike (FEAR-93)

Throwaway prototype for the checks in `docs/mobile-shell-decision.md`. Not built or run yet. The real shells come in FEAR-94 (iOS) and FEAR-95 (Android).

## Run it
Needs Node 22. iOS needs a Mac with Xcode. Android needs Android Studio, which works on Windows.

```sh
cd mobile
npm install            # then pin the installed versions in package.json
npx cap add ios        # Mac only
npx cap add android
npx cap sync
npx cap open ios       # or: npx cap open android, then Run on a phone
```

Register the `fearville` URL scheme so sign-in can return to the app:
- **iOS:** in Xcode → Info → URL Types, add `fearville`.
- **Android:** add an intent filter for `fearville://signin` to `MainActivity` in `AndroidManifest.xml`.

The staging site must include the adapter from this branch (`lib/native/capacitor.ts`, mounted by `components/native-shell.tsx`).

## Checks
1. **Plugins after navigation:** the app opens staging. In Safari Web Inspector or `chrome://inspect`, `window.FearvilleNative.capabilities` lists `haptics`, `share`, `keepAwake`, `lifecycle`, `auth`, and `FearvilleNative.call('haptics.play', {kind: 'tap'})` buzzes. If it doesn't, switch to `server.url` in `capacitor.config.ts` and repeat.
2. **Google sign-in:**
   1. In the console, POST `/api/accounts/start` with a `nativeChallenge` (PKCE S256 of a verifier you keep).
   2. Call `FearvilleNative.call('auth.open', {url})` with the returned URL and complete Google sign-in.
   3. The app receives a `fearville:native` event `{type: 'signin', code}`.
   4. POST `/api/accounts/exchange` with `{code, verifier}` and check that an `accountToken` comes back.
3. **Offline:** enable airplane mode and launch. "Can't reach Fearville" and Retry appear. Turn the network back on, tap Retry, and staging loads.

Record the results on FEAR-93.
