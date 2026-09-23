# Fearville

A text-only, in-person Trouble Brewing companion: a web app, shared Cloudflare Worker/D1 backend, and native SwiftUI iPhone client. Both clients use the same server-authoritative rules and action forms.

## Run the web app locally

Requires Node 22.13 or newer.

```sh
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_complex_alice.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_fine_komodo.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0002_smiling_northstar.sql
npm run dev
```

Open the Local URL printed by the server. Create a session, then join from separate browser profiles or devices. A browser profile holds one session identity; the Storyteller and players need separate profiles/devices. The local development URL is not a remotely accessible production server.

```sh
node --experimental-strip-types --test tests/engine.test.ts tests/accounts.test.ts tests/social.test.ts tests/polls.test.ts tests/assignment.test.ts
node tests/integration.mjs
node tests/session-rejoin-integration.mjs
node tests/accounts-integration.mjs
node tests/social-integration.mjs
npx tsc --noEmit
npm run build
```

Integration tests require the development server and create test sessions and fixture accounts in the local database. They test simultaneous joins and votes, privacy, authorization, timer advancement, recovery, account scoping, and the whole social flow (handles, friend requests, invitations, recorded results, ratings, rewind withdrawal, and deletion). The social suite sends many requests; if a run trips the per-minute rate limit, wait for the next minute and run it again.

## Session behavior

- **Rules & roles** is available publicly at `/rules`, linked from the entry page. Players and Storytellers can also open the **Rules** tab inside a lobby or active game. Both use the same rules summary, Fearville instructions, and all 22 Trouble Brewing character descriptions, grouped by team; the reference never reveals assigned roles. Links back to the table preserve the browser’s session.
- Create a room; 5–15 players join using its six-letter code. Names are unique within the room. Joining locks when the game starts; existing players reconnect using the device session or a private recovery key.
- Storytellers edit seats and assign roles, configure timers, three Demon bluffs (7+ players), and the Fortune Teller red herring. Setup checks include the Baron and the Drunk’s shown role.
- In the lobby, Storytellers can use **Randomly assign roles** to preview and apply a balanced setup, or **Manually assign roles** to edit each seat. Random setup handles the Baron, the Drunk’s shown character, three out-of-play good bluffs, and a good red herring. Confirmation applies exactly the previewed assignments. Randomizing again replaces the setup; manual edits and undo remain available before starting. No role information is delivered to players until the game starts.
- The entry page detects an existing browser session and offers **Rejoin lobby** or **Return to game** for both players and Storytellers. Re-entering the same session code with a valid device cookie also resumes the original identity without adding a seat, including after play begins. On mobile, returning to the browser or reconnecting immediately refreshes the table. Normal browser storage retains credentials for up to 30 days; clearing data, private browsing, or switching devices requires a saved recovery key (entry page → **Rejoin**) or an account-linked seat. Use **Save recovery key** at the table before leaving if you need a backup. A room code and player name alone never grant access to an existing seat.
- Actual roles, poisoned/protected status, reminders, history, and night tasks are filtered on the server. A player receives only their shown character and intended messages. Night deaths become public at dawn.
- The current night action is always the earliest unfinished eligible action. Player choices arrive by private chat; the Storyteller selects those choices in the action form. Structured information goes directly to the recipient after confirmation.
- Each night has a randomly selected fun poll from a shared question pool, without repeating the preceding question. Players with no night activity can pick a name while others act. All seated players, including dead players and players with abilities, can participate so poll access never signals a role or hidden night death. Abilities still take priority. One private answer per player can be changed until dawn; polls never hold up night resolution. After dawn, Game flow shows the favorite or tied favorites, without vote counts or voter identities. Questions are shared for meaningful results. Rewind restores the saved poll state. Existing sessions first receive a poll when their next night begins.
- Mobile web uses bottom navigation, touch-sized controls, 16px form text, safe-area spacing, and scrollable dialogs sized to the available viewport. Current Game flow activities appear before the character card on phones.
- All substantive actions preview their actual result before commit. Characters with registration flexibility require the Storyteller to enter the appropriate override reason. A poisoned Spy requires a manually supplied replacement Grimoire.
- Discovery → Discussion → Nominations, and Defense → Voting, use shared server deadlines. Polling runs every two seconds. After a disconnection the next authenticated request catches up elapsed phases. No background service, push notification, or offline play is promised. Timers do not depend on a particular phone remaining foregrounded, but clients must connect to receive updates.
- Nominations suspend and resume the remaining nomination period. Living players nominate once a day; a target may be nominated once a day. Dead targets and self-nominations are allowed.
- Yes/no ballots close at the voting deadline. Dead players spend their one remaining vote only on a counted yes. A living, healthy Butler’s yes is excluded unless their master also votes yes. Abstention/no never spends a ghost vote.
- Only votes meeting the alive-player majority threshold qualify. A tie at the highest qualifying count blocks execution. The day ends at a Storyteller confirmation step so character effects and win rulings can be reviewed.
- Poison, Monk protection, Imp attacks, Mayor redirection, Imp succession, conditional Ravenkeeper/Undertaker wakes, first-night information, recurring information, Spy information, Virgin execution, Slayer claims (including bluffs), Saint loss, and win-condition prompts are supported. Registration is a human ruling, not randomly automated.
- Storytellers may pause, extend, advance, edit, override, or rewind. Rewinding restores the selected decision and later game changes while retaining messages; it sends a correction and pauses the restored timer. Information already read cannot be erased from a person’s knowledge. Rewinding across player joins is refused to avoid orphaning a device identity.
- Recovery credentials are stored as hashes on the backend, HttpOnly cookies on web, and Keychain items on iOS. They expire after 30 days. Do not share the Storyteller recovery key. Optional Google and Apple accounts can save seats across devices. Explicit provider linking, sign-out, and account deletion are included. See ACCOUNT-SETUP.md to activate providers.

## Social system

Signed-in players get a public handle, a friends list, table invitations, a Storyteller rating, and a record of finished games. Guests can still play; everything below requires an account.

- **Handles.** Each account chooses one unique handle (`/friends`): 3–20 lowercase letters, numbers, or underscores. Handles are the only way to find another player; emails are never searchable or shown.
- **Friends.** Send a request by handle; the other player accepts or declines. Two players who request each other become friends immediately. Friends can be removed; blocking removes the friendship, withdraws waiting invitations in both directions, hides your profile from that player, and stops their requests.
- **Invitations.** In a lobby, every seated, signed-in player sees an *Invite friends* panel on the Game flow tab. Invitations go only to friends, last 24 hours, and lapse when the game starts. The invitee accepts from `/friends` (or the badge on the entry page) and is seated under their account name with the seat saved to their account. Invitation acceptance uses the same join path as the code form, so lobby, capacity, and unique-name rules apply.
- **Recorded games.** When a game reaches the ended phase after at least one night, the server records the result: the winning team, the Storyteller, and every seat's final character and alignment. The record is keyed by session code plus creation time, is independent of the session row (it survives session deletion and code reuse), and is written idempotently on the ending action and on later polls, so a transient database failure at game end is repaired automatically. If the Storyteller rewinds out of the ended phase the record is withdrawn, and it is written again if the game ends again. Seats attach to accounts at recording time or later, when a guest saves the seat.
- **Rating the Storyteller.** After a game ends, seated players whose seat is saved to an account can rate the Storyteller 1–5 stars with an optional comment (Game flow tab). Ratings are credited only when the Storyteller's seat is linked to an account, can be revised for 14 days, and count once per player per game. The Storyteller sees stars and comments on `/stats`; comments are never shown to anyone else. Friends see the average.
- **Records.** `/stats` shows games played, wins and losses as town and as evil (final alignment: a Minion who became the Imp counts as the Imp, the Drunk counts as good), each character's played/won/lost, games run as Storyteller, average rating, recent games, and received feedback. `/friends` shows games played with each friend (seated together or one storytelling for the other). `/profile?handle=…` shows the full record to friends and only a games-played count to everyone else. All figures are aggregated from the game records on demand; nothing is counted incrementally.
- **Deletion.** Deleting an account removes its handle, friendships, ratings given and received, invitations, and seat links. Finished games remain in other players' records with that seat no longer linked to any account.
- **API.** `GET/POST /api/social` (actions: `handle`, `request`, `accept`, `dismiss`, `remove`, `block`, `unblock`, `invite`, `acceptInvite`, `declineInvite`, `revokeInvite`, `rate`), `GET /api/social/profile?handle=`, and `GET /api/social/table?code=`. All accept the same account and seat credentials as the existing routes, so the iOS client can adopt them; the SwiftUI app has not been updated for these screens yet.

## iOS and TestFlight

Open `ios/ClocktowerTable.xcodeproj` on a Mac. Follow `ios/TESTFLIGHT.md`. The SwiftUI app is a native client, not a web wrapper. A shared scheme and an unsigned simulator CI workflow are included. The project has not been compiled with Xcode in the Windows authoring environment; a Mac build and device checks remain required before distribution.

The deployed entry page is public at https://fearville.phatsyloaf.chatgpt.site. Do not embed a Sites owner bypass token in the iOS app. The session API itself enforces per-seat credentials even when the entry page is public.

## Sources and scope

Night order verified 2026-09-08 against the publisher’s canonical data:
https://github.com/ThePandemoniumInstitute/botc-release/blob/main/resources/data/nightsheet.json

Rules reference: https://wiki.bloodontheclocktower.com/Trouble_Brewing and linked character pages. UI descriptions are original brief summaries. No official artwork is included. This is an unofficial companion and is not affiliated with The Pandemonium Institute.

Only Trouble Brewing is supported: no Travellers, custom scripts, remote voice chat, or automated Storyteller. Closed-room internet-connected play is the intended use. Production data is not seeded with sample games.

## Validation on the authoring host

- Role assignment and rejoin updates: all 42 unit tests passed, including random setup validation across 5–15 players. Session integration checks passed for preview consistency, manual edits, same-device rejoin, cross-browser recovery, preserved Storyteller permissions, and impersonation rejection. Mobile browser automation verified both users returning after browser closure, both recovery forms, and the Storyteller’s random/manual controls at 320px width. Physical iPhone/Safari checks remain outstanding.
- 18 engine tests, 7 account cryptography tests, and 6 social result-derivation tests passed.
- Multi-client API integration tests (session, accounts, social) passed against the local D1-backed server.
- TypeScript checking, app/domain lint, and the production build passed.
- The unmodified starter component catalog has pre-existing lint findings; `npm run lint` scans that catalog too. The app/domain check is `npx oxlint app lib/game lib/accounts lib/social components/account-panel.tsx components/social db tests`.
- Night polls have six additional tests covering privacy, authorization, ties, night transitions, rewind, and older saves. The API integration suite also checks simultaneous poll submissions. Mobile browser checks exercised the player poll form and Storyteller layout at 320, 390, and 768px widths with no horizontal overflow. Physical iPhone/Safari verification and Xcode compilation remain outstanding. Native signing and TestFlight upload remain Mac-side steps.

