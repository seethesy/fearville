# Mobile shell prototype (FEAR-93)

Prototype for the checks in `docs/mobile-shell-decision.md`: Capacitor 8 loading the hosted site (`server.url`) with a bundled error page (`server.errorPath`). The real shells are built in FEAR-94 (iOS) and FEAR-95 (Android), starting from this folder.

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

## iOS (Mac with Xcode; FEAR-94)

```sh
cd mobile
npm install
npx cap add ios
npm run sync
npx cap open ios
```

Then in Xcode:
1. Add `native/ios/FearvilleAuthPlugin.swift` and `native/ios/FearvilleBridgeViewController.swift` to the **App** target.
2. In `Main.storyboard`, set the Bridge View Controller's custom class to `FearvilleBridgeViewController`.
3. You don't need a URL Type for `fearville`: `ASWebAuthenticationSession` catches the callback itself.

## Checks

Open the WebView console: `chrome://inspect` on the PC for Android, Safari → Develop for iOS.

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
