# Mobile

The iOS app is a Capacitor shell loading the hosted Fearville web UI. Open
`mobile/ios/App/App.xcodeproj`; setup, build configurations, sign-in, Universal
Links and device checks are documented in [mobile/README.md](../mobile/README.md).
Android shell work is tracked in FEAR-95.

Staging loads `https://staging.fearville.app` with the Fearville β name and BETA
icon; Release loads `https://fearville.app`. The shell owns platform integration;
gameplay, tutorials, rules, social, shop and purchase UI live in the web app.
Purchases use the native bridge for platform APIs (FEAR-74 / FEAR-76).

FEAR-97 retires the separate SwiftUI client after Art confirmed the TestFlight
full-game check passed. Icons, logo and Metal Mania font are retained in
`mobile/ios/App/App/`; bundled offline assets and the font license are in
`mobile/www/assets/`. Rules, glossary, tutorials and live text come from the
hosted app, with no generated iOS JSON copies.

`.github/workflows/mobile-ios.yml` replaces the old SwiftUI `ios.yml` workflow.
It validates unsigned Staging and Release simulator shells and checks bundled
resources. Signed TestFlight/Play uploads remain FEAR-108 with credentials from
FEAR-109. Mobile builds run only in CI; agents never run `xcodebuild` or Gradle.

The deployed entry page is public at https://fearville.app. Do not embed a Sites
owner bypass token in a shell. APIs enforce account and per-seat credentials.
System-browser sign-in returns a single-use PKCE code; `native_codes` and
`/api/accounts/exchange` remain required, and the exchange sets the WebView's
HttpOnly `ct_account` cookie.
