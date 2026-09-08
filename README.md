# Clocktower Table

A text-only, in-person Trouble Brewing companion: a web app, shared Cloudflare Worker/D1 backend, and native SwiftUI iPhone client. Both clients use the same server-authoritative rules and action forms.

## Run the web app locally

Requires Node 22.13 or newer.

```sh
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_complex_alice.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_fine_komodo.sql
npm run dev
```

Open the Local URL printed by the server. Create a session, then join from separate browser profiles or devices. A browser profile holds one session identity; the Storyteller and players need separate profiles/devices. The local development URL is not a remotely accessible production server.

```sh
node --experimental-strip-types --test tests/engine.test.ts
node tests/integration.mjs
npx tsc --noEmit
npm run build
```

Integration tests require the development server and create a test session. They test simultaneous joins and votes, privacy, authorization, timer advancement, and recovery.

## Session behavior

- Create a room; 5–15 players join using its six-letter code. Names are unique within the room. Joining locks when the game starts; existing players reconnect using the device session or a private recovery key.
- Storytellers edit seats and assign roles, configure timers, three Demon bluffs (7+ players), and the Fortune Teller red herring. Setup checks include the Baron and the Drunk’s shown role.
- Actual roles, poisoned/protected status, reminders, history, and night tasks are filtered on the server. A player receives only their shown character and intended messages. Night deaths become public at dawn.
- The current night action is always the earliest unfinished eligible action. Player choices arrive by private chat; the Storyteller selects those choices in the action form. Structured information goes directly to the recipient after confirmation.
- All substantive actions preview their actual result before commit. Characters with registration flexibility require the Storyteller to enter the appropriate override reason. A poisoned Spy requires a manually supplied replacement Grimoire.
- Discovery → Discussion → Nominations, and Defense → Voting, use shared server deadlines. Polling runs every two seconds. After a disconnection the next authenticated request catches up elapsed phases. No background service, push notification, or offline play is promised. Timers do not depend on a particular phone remaining foregrounded, but clients must connect to receive updates.
- Nominations suspend and resume the remaining nomination period. Living players nominate once a day; a target may be nominated once a day. Dead targets and self-nominations are allowed.
- Yes/no ballots close at the voting deadline. Dead players spend their one remaining vote only on a counted yes. A living, healthy Butler’s yes is excluded unless their master also votes yes. Abstention/no never spends a ghost vote.
- Only votes meeting the alive-player majority threshold qualify. A tie at the highest qualifying count blocks execution. The day ends at a Storyteller confirmation step so character effects and win rulings can be reviewed.
- Poison, Monk protection, Imp attacks, Mayor redirection, Imp succession, conditional Ravenkeeper/Undertaker wakes, first-night information, recurring information, Spy information, Virgin execution, Slayer claims (including bluffs), Saint loss, and win-condition prompts are supported. Registration is a human ruling, not randomly automated.
- Storytellers may pause, extend, advance, edit, override, or rewind. Rewinding restores the selected decision and later game changes while retaining messages; it sends a correction and pauses the restored timer. Information already read cannot be erased from a person’s knowledge. Rewinding across player joins is refused to avoid orphaning a device identity.
- Recovery credentials are stored as hashes on the backend, HttpOnly cookies on web, and Keychain items on iOS. They expire after 30 days. Do not share the Storyteller recovery key. Optional Google and Apple accounts can save seats across devices. Explicit provider linking, sign-out, and account deletion are included. See ACCOUNT-SETUP.md to activate providers.

## iOS and TestFlight

Open `ios/ClocktowerTable.xcodeproj` on a Mac. Follow `ios/TESTFLIGHT.md`. The SwiftUI app is a native client, not a web wrapper. A shared scheme and an unsigned simulator CI workflow are included. The project has not been compiled with Xcode in the Windows authoring environment; a Mac build and device checks remain required before distribution.

The deployed entry page is public at https://clocktower-table.phatsyloaf.chatgpt.site. Do not embed a Sites owner bypass token in the iOS app. The session API itself enforces per-seat credentials even when the entry page is public.

## Sources and scope

Night order verified 2026-09-08 against the publisher’s canonical data:
https://github.com/ThePandemoniumInstitute/botc-release/blob/main/resources/data/nightsheet.json

Rules reference: https://wiki.bloodontheclocktower.com/Trouble_Brewing and linked character pages. UI descriptions are original brief summaries. No official artwork is included. This is an unofficial companion and is not affiliated with The Pandemonium Institute.

Only Trouble Brewing is supported: no Travellers, custom scripts, remote voice chat, or automated Storyteller. Closed-room internet-connected play is the intended use. Production data is not seeded with sample games.

## Validation on the authoring host

- 18 engine tests and 7 account cryptography tests passed.
- Multi-client API integration tests passed against the local D1-backed server.
- TypeScript checking, app/domain lint, and the production build passed.
- The unmodified starter component catalog has pre-existing lint findings; `npm run lint` scans that catalog too. The app/domain check is `npx oxlint app lib/game lib/accounts components/account-panel.tsx db tests`.
- No browser interaction tests or Xcode compilation were performed. Native signing, device verification, and TestFlight upload remain Mac-side steps.

