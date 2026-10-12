# Mobile

Open `ios/Fearville.xcodeproj` on a Mac. Follow `ios/TESTFLIGHT.md`. The SwiftUI app is a native client, not a web wrapper. The shared scheme builds unsigned for both simulator architectures in GitHub Actions. Physical device checks and a signed distribution build remain required before distribution.

The deployed entry page is public at https://fearville.app. Do not embed a Sites owner bypass token in the iOS app. The session API itself enforces per-seat credentials even when the entry page is public.


The native SwiftUI app is being replaced by web-in-native shells for iOS and Android (Jira epic FEAR-79). Mobile builds will run only in CI (FEAR-108); agents never run `xcodebuild` or Gradle.
