# TestFlight handoff

## Status

Native SwiftUI source, Xcode project, app icon, privacy manifest, and shared scheme are included. This app has **not** been compiled or signed on a Mac, uploaded to App Store Connect, or distributed through TestFlight. The authoring host is Windows and has no access to your Mac or Apple signing identity.

## Build on your Mac

1. Open `ClocktowerTable.xcodeproj` in the current stable Xcode supported by App Store Connect.
2. Select the ClocktowerTable target → Signing & Capabilities. Select your Apple Developer team, keep automatic signing enabled, and replace `com.example.ClocktowerTable` with your registered unique bundle identifier.
3. In `ClocktowerTable/Info.plist`, verify `ClocktowerAPIURL`. It currently points to the deployed Sites backend. The backend must allow player access; an owner-only Sites page cannot serve an anonymous native client. Do not put owner tokens in the app.
4. Select an iPhone simulator and run. Then run on a real iPhone. Minimum target: iOS 17.
5. Verify with one Storyteller and at least five separate player identities: join, assign/deal, private messages, each night form, timers, voting, role secrecy, background/foreground recovery, and undo. Use web browsers alongside the iPhone client. Each device may hold one active seat.
6. Optional unsigned build check:
   `xcodebuild -project ClocktowerTable.xcodeproj -scheme ClocktowerTable -sdk iphonesimulator -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`

## Upload

1. Register your bundle ID and create the matching iOS app record in App Store Connect.
2. Confirm the app name, age rating, support contact, and App Privacy answers. This app stores chosen display names, anonymous seat identifiers, session/game state and private messages for game functionality. No advertising or tracking SDK is included. Hosting may process IP addresses for rate limiting and service operation.
3. Set an unused build number in the Xcode target. Select a generic iOS device destination, then Product → Archive.
4. In Organizer, validate the archive and choose Distribute App → App Store Connect → Upload.
5. After Apple processes the build, add it to a TestFlight group. Internal testers must be App Store Connect users with suitable access. External testing may require Beta App Review. Supply your feedback email and the testing notes below. Do not invite testers until you are ready to send invitations.

Suggested beta description:
“An in-person companion for Trouble Brewing. A human Storyteller hosts a session and players join with a code. Private role delivery, night information and messages, shared timers, nominations and voting support play around a physical table.”

Suggested testing notes:
“Use one Storyteller and 5–15 players. Test cross-device role privacy, private messages, guided nights, phase timers, votes, and Storyteller corrections. Keep the app open and internet-connected. No voice chat or background push notifications are included.”

Official upload guide: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
Official TestFlight guide: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/

The included GitHub Actions workflow can compile an unsigned simulator build on a Mac runner if you put the source into your own repository and run it. It does not upload to TestFlight and does not contain credentials.
