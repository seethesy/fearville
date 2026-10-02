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
node --experimental-strip-types --test tests/*.test.ts
node tests/integration.mjs
node tests/session-rejoin-integration.mjs
node tests/membership-integration.mjs
node tests/accounts-integration.mjs
node tests/social-integration.mjs
node tests/hms-integration.mjs
npx tsc --noEmit
npm run build
```

Integration tests require the development server and create test sessions and fixture accounts in the local database. They test simultaneous joins and votes, privacy, authorization, timer advancement, recovery, account scoping, and the whole social flow (handles, friend requests, invitations, recorded results, ratings, rewind withdrawal, and deletion). The social suite sends many requests; if a run trips the per-minute rate limit, wait for the next minute and run it again.

## Session behavior

- **Rules & roles** is available publicly at `/rules`, linked from the entry page. Players and Storytellers can also open the **Rules** tab inside a lobby or active game. Both use the same rules summary, Fearville instructions, and all 22 Trouble Brewing character descriptions, grouped by team; the reference never reveals assigned roles. Links back to the table preserve the browser’s session.
- Create a room; 5–15 players join using its six-letter code. Names are unique within the room. Joining locks when the game starts; existing players reconnect using the device session or a private recovery key.
- Storytellers edit seats and assign roles, configure timers, three Demon bluffs (7+ players), and the Fortune Teller red herring. Setup checks include the Baron and the Drunk’s shown role.
- In the lobby, Storytellers can use **Randomly assign roles** to apply a balanced setup, or **Manually assign roles** to edit each seat. Random setup handles the Baron, the Drunk’s shown character, three out-of-play good bluffs, and a good red herring. Randomizing again replaces the setup; manual edits and undo remain available before starting. No role information is delivered to players until the game starts.
- The entry page detects an existing browser session and offers **Rejoin lobby** or **Return to game** for both players and Storytellers. Re-entering the same session code with a valid device cookie also resumes the original identity without adding a seat, including after play begins. On mobile, returning to the browser or reconnecting immediately refreshes the table. Normal browser storage retains credentials for up to 30 days; clearing data, private browsing, or switching devices requires a saved recovery key (entry page → **Rejoin**) or an account-linked seat. Use **Save recovery key** at the table before leaving if you need a backup. A room code and player name alone never grant access to an existing seat.
- Actual roles, poisoned/protected status, reminders, history, and night tasks are filtered on the server. A player receives only their shown character and intended messages. Night deaths become public at dawn.
- The current night action is always the earliest unfinished eligible action. Player choices arrive by private chat; the Storyteller selects those choices in the action form. Structured information goes directly to the recipient after confirmation.
- Each night has a randomly selected fun poll from a shared question pool, without repeating the preceding question. Players with no night activity can pick a name while others act. All seated players, including dead players and players with abilities, can participate so poll access never signals a role or hidden night death. Abilities still take priority. One private answer per player can be changed until dawn; polls never hold up night resolution. After dawn, Game flow shows the favorite or tied favorites, without vote counts or voter identities. Questions are shared for meaningful results. Rewind restores the saved poll state. Existing sessions first receive a poll when their next night begins.
- Mobile web uses bottom navigation, touch-sized controls, 16px form text, safe-area spacing, and scrollable dialogs sized to the available viewport. Current Game flow activities appear before the character card on phones.
- Web game actions apply directly: fill any required fields and press the action button. Actions without fields run immediately. There is no preview step. Server authorization, rule checks, and stale-state protection still apply. Messages send directly from the conversation composer without preview or confirmation. Characters with registration flexibility require the Storyteller to enter the appropriate override reason. A poisoned Spy requires a manually supplied replacement Grimoire.
- **Messages** presents a private conversation for each player, with chronological bubbles, timestamps, per-thread drafts, new-message counts during the current visit, and direct Send/Enter-to-send. Shift+Enter adds a line. The Storyteller’s Everyone thread is explicitly public; private threads do not mix other players’ messages. Seats also provides an Open conversation shortcut. Retrying an uncertain send with the same message identifier does not duplicate it.
- **Seats → Your seat & table** lets players and Storytellers rename themselves. Players can leave, Storytellers can remove players, and the Storyteller can permanently delete an unstarted lobby. Destructive operations require confirmation. Leaving/removal revokes all seat credentials and saved-account seat links atomically; a lobby seat is removed and remaining seats are renumbered. During play the character is retained with a Left table label for the Storyteller to manage. Removal clears earlier rewind points so access cannot be restored accidentally; renaming preserves game history. Closing a tab still allows normal rejoining and is different from leaving.
- Discovery → Discussion → Nominations, and Defense → Voting, use shared server deadlines. The foreground table automatically checks for updates one second after each completed request. Requests do not overlap, stalled requests time out and retry, and older responses cannot roll back newer actions. Returning to the app or reconnecting triggers an immediate update. After a disconnection the next authenticated request catches up elapsed phases. No background service, push notification, or offline play is promised. Timers do not depend on a particular phone remaining foregrounded, but clients must connect to receive updates.
- Nominations suspend and resume the remaining nomination period. Living players nominate once a day; a target may be nominated once a day. Dead targets and self-nominations are allowed.
- Yes/no votes are public during voting and in the completed ballot breakdown. By this table’s rule, the nominee cannot vote. Ballots close immediately when every eligible player has explicitly answered Yes or No, or at the deadline if anyone is still waiting. Departed players and dead players with spent votes are excluded from completion. Dead players spend their one remaining vote only on a counted yes. A living, healthy Butler’s yes is excluded unless their master also votes yes. Abstention/no never spends a ghost vote.
- Only votes meeting the alive-player majority threshold qualify. A tie at the highest qualifying count blocks execution. The day ends at a Storyteller confirmation step so character effects and win rulings can be reviewed.
- Poison, Monk protection, Imp attacks, Mayor redirection, Imp succession, conditional Ravenkeeper/Undertaker wakes, first-night information, recurring information, Spy information, Virgin execution, Slayer claims (including bluffs), Saint loss, and win-condition prompts are supported. Registration is a human ruling, not randomly automated.
- Storytellers may pause, extend, advance, edit, override, or rewind. Rewinding restores the selected decision and later game changes while retaining messages; it sends a correction and pauses the restored timer. Information already read cannot be erased from a person’s knowledge. Rewinding across player joins is refused to avoid orphaning a device identity.
- Recovery credentials are stored as hashes on the backend, HttpOnly cookies on web, and Keychain items on iOS. They expire after 30 days. Do not share the Storyteller recovery key. Optional Google and Apple accounts can save seats across devices. Explicit provider linking, sign-out, and account deletion are included. See ACCOUNT-SETUP.md to activate providers.

## Holy Moon and Stars

Choose the script in the lobby (**Change role script**). Classic games are unchanged. Characters must come from the selected script; random assignment supports both (it never deals the Atheist, though the Storyteller may request one in the role picker).

- **Night order.** Night 1: evil introductions (7+ players; never with an Atheist) → Constellation → Stargazer → Astrologist → Mystic → Astronaut → Prophet → Diviner → Miasma → Grim Reaper → Werewolf → Dreameater → Spirit → Insomniac → queued deaths. Later nights: last night’s plague (the victim dies and their living neighbors are poisoned before anyone acts) → an executed Nightmare chooses whom to haunt → Medium → Gravedigger → Priest → Necromancer → Constellation guess (never Night 1) → Diviner → Miasma → Grim Reaper → Werewolf (kills on Nights 3, 6, 9…) → Dreameater → Spirit → Insomniac → queued deaths. A dead player reached by the Medium acts in their own slot. Dead players act only through the Medium, as the Spirit, or as an executed Nightmare.
- **Player choices.** Players submit choices during the night-choice timer: up to three players, the Diviner’s question, the Dreameater’s guesses, the Constellation’s guesses, or a pass for once-per-game abilities. The Storyteller confirms each task with calculated suggestions (Astronaut distance, Prophet roles, Astrologist characters, Mystic connections, Spirit and Insomniac visits).
- **Visits.** Any ability that chooses a player visits them (Constellation, Stargazer, Astrologist, Mystic, Medium, Gravedigger, Priest, Necromancer, Spirit, Miasma, Grim Reaper, Werewolf, Nightmare). Redirects land the visit on the final target.
- **Deaths.** Every death goes through one queue, one at a time: redirects first (Dazed, then the Nightmare, resolved on the targeting ability), then prevention (Extra Life; the Celestial protects good players by day), then the Fateweaver may move the death once (the new target is checked again), then the death and its triggers (Constellation link deaths at the Storyteller’s choice, the Zealot’s granted ability, the Priest’s self-revival, Celestial execution, Nightmare execution, Moonshiner). Horror and other night deaths wait until after the Spirit and Insomniac. Day deaths (executions, reaping) resolve immediately; the day cannot end while one is pending.
- **Dawn.** Priest and Necromancer revivals, the Gravedigger’s new character and the Priest’s self-revival apply at dawn with the new alignment. The Medium’s private channel closes at dawn; its transcript stays in the Storyteller log.
- **Hidden and drunk characters.** The Dazed and Moonshiner Fools are shown an out-of-play Villager and are drunk; a Lost Soul is shown the Lost Soul but acts as a hidden Villager. The Zealot’s death still grants the Storyteller an ability while drunk. **Sober up the Fools** reveals real characters at any time. An executed Celestial poisons everyone until the following dusk and makes one Villager drunk for the rest of the game.
- **Zealot.** The Storyteller chooses any script ability and acts with it from the next night, in that character’s slot after any player with the same character. The Storyteller cannot be targeted.
- **Day buttons.** The Astrophage ends the day early (once; not with 4 or fewer living), the Grim Reaper reaps all marks (with confirmation), the Fateweaver sets a preferred redirect, and the Storyteller can record a **Prophet reveal**, which queues the Prophet and a neighbor to die that night.
- **Atheist.** Every player is good. Players may nominate the Storyteller; executing the Storyteller with an Atheist in play wins for good, and two players remaining wins for evil (the Storyteller). Without an Atheist, the Storyteller chooses whether the nominator is executed instead.
- **iPhone.** The native client shows the script name and all Storyteller and day controls. Players on iPhone send night choices to the Storyteller by message.

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

Fearville Classic (Trouble Brewing) and Holy Moon and Stars are supported. No Travellers, arbitrary custom scripts, remote voice chat, or automated Storyteller. Closed-room internet-connected play is the intended use. Production data is not seeded with sample games.

## Night puzzles

Every seated web player can open **Game flow → Night puzzles** during the night, in either script, regardless of role or survival status. Existing night-choice dialogs, messages, and polls remain available. Puzzles run locally, never delay dawn, and do not award information or recharge abilities. No database migration or dependency was added. Leaving the Game flow panel, reloading, or reaching dawn clears the current round; there is no persistent leaderboard or cross-device progress. Native iOS puzzle screens and mission-based ability refresh are outside this implementation.

- Tile Memory, Odd One Out, and Rhythm Sequence support levels 1–20; Category Sorting and Pattern Completion support levels 1–10. Seen / New Words has one configurable 20-word mode.
- `lib/puzzles/config.ts` holds difficulty bands, preview/playback timing, three-mistake limits, word mix/streak settings, pattern families, and rhythm repetition/failure options. Tile grids scale 3×3 to 6×6; rhythm scales from two to four buttons. Sorting scales from two categories/six items to three categories/twelve items. Odd One Out uses four to six choices and increasingly related categories.
- `lib/puzzles/words.ts` holds editable category metadata, curated disjoint groups, and the word pool. Odd One Out explicitly names the main category to avoid competing interpretations; sorting uses disjoint category sets. Wrong sorting answers leave the current item available for correction.
- `lib/puzzles/random.ts` provides seeded random sampling without replacement. `generate.ts` derives content from difficulty settings and validates it with a maximum of 20 generation attempts. Pattern families include symbol cycles, grouped cycles, addition/subtraction, alphabet skips, multiplication, increasing differences, alternating operations, and interleaved progressions.
- `lib/puzzles/session.ts` exposes the common `createPuzzle(kind)` interface: `start(level, seed?)`, `input(state, action)`, and `restart(state, sameContent?)`. Pure transitions handle preview, play, success, failure, actual word history, duplicate tile input, and terminal-state protection. Rhythm defaults to judging the complete sequence.
- `components/night-puzzles.tsx` renders those states, handles disposable playback timers, and offers new rounds, exact replays, level selection, and next-level progression. Generation and validation stay outside the component.
- `tests/puzzles.test.ts` adds 27 tests, including all 81 puzzle/level combinations across 100 seeds, independent pattern-rule checks, invalid content, difficulty boundaries, replay, failure behavior, and bounded generation retries. The full 118-test suite, TypeScript, focused lint, production build, Classic HTTP integration, and Holy Moon and Stars HTTP integration passed. Browser checks covered the six puzzle screens, tile success, word/rhythm input, and mobile layout at 390px. Physical mobile-device verification remains outstanding.

## Validation on the authoring host

- Role assignment and rejoin updates: all 42 unit tests passed, including random setup validation across 5–15 players. Session integration checks passed for preview consistency, manual edits, same-device rejoin, cross-browser recovery, preserved Storyteller permissions, and impersonation rejection. Mobile browser automation verified both users returning after browser closure, both recovery forms, and the Storyteller’s random/manual controls at 320px width. Physical iPhone/Safari checks remain outstanding.
- 18 engine tests, 7 account cryptography tests, and 6 social result-derivation tests passed.
- Multi-client API integration tests (session, accounts, social) passed against the local D1-backed server.
- TypeScript checking, app/domain lint, and the production build passed.
- The unmodified starter component catalog has pre-existing lint findings; `npm run lint` scans that catalog too. The app/domain check is `npx oxlint app lib/game lib/accounts lib/social components/account-panel.tsx components/social db tests`.
- Night polls have six additional tests covering privacy, authorization, ties, night transitions, rewind, and older saves. The API integration suite also checks simultaneous poll submissions. Mobile browser checks exercised the player poll form and Storyteller layout at 320, 390, and 768px widths with no horizontal overflow. Physical iPhone/Safari verification and Xcode compilation remain outstanding. Native signing and TestFlight upload remain Mac-side steps.



