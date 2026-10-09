# Fearville

A text-only, in-person game companion: a web app, shared Cloudflare Worker/D1 backend, and native SwiftUI iPhone client. Both clients use the same server-authoritative rules and action forms.

## Run the web app locally

Requires Node 22.13 or newer.

```sh
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_complex_alice.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_fine_komodo.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0002_smiling_northstar.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0003_new_elektra.sql
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
node tests/progression-integration.mjs
node tests/hms-integration.mjs
node tests/hof-integration.mjs
node tests/introductions-integration.mjs
node tests/nightmare-integration.mjs
node tests/sandbox-lobby-integration.mjs
node tests/lobby-recap-integration.mjs
npx tsc --noEmit
npm run build
```

Integration tests require the development server and create test sessions and fixture accounts in the local database. They test simultaneous joins and votes, privacy, authorization, timer advancement, recovery, account scoping, and the whole social flow (handles, friend requests, invitations, recorded results, ratings, rewind withdrawal, and deletion). The social suite sends many requests; if a run trips the per-minute rate limit, wait for the next minute and run it again.

## Session behavior

Account progression, ranked Elo, statistics, social privacy, and migration details are documented in [SOCIAL-SYSTEM.md](SOCIAL-SYSTEM.md).

- **Rules & roles** is public at `/rules` and in each table. It lists Holy Moon and Stars and Horrors of Fearville by team, with a shared glossary. It never reveals assigned roles.
- Create a room; 5–18 players join using its six-letter code. Names are unique within the room. Joining locks when the game starts; existing players reconnect using the device session or a private recovery key.
- Players claim and release their own seats in the lobby. New arrivals are unseated; everyone must choose a seat before roles are dealt. Storytellers assign roles, configure timers, and review script-specific setup.
- Storytellers may assign roles randomly or manually. Random setup respects each script’s counts and hidden characters, bluffs, and reminders. No roles are delivered until the game starts.
- The entry page detects an existing browser session and offers **Rejoin lobby** or **Return to game** for both players and Storytellers. Re-entering the same session code with a valid device cookie also resumes the original identity without adding a seat, including after play begins. On mobile, returning to the browser or reconnecting immediately refreshes the table. Normal browser storage retains credentials for up to 30 days; clearing data, private browsing, or switching devices requires a saved recovery key (entry page → **Rejoin**) or an account-linked seat. Use **Save recovery key** at the table before leaving if you need a backup. A room code and player name alone never grant access to an existing seat.
- Actual roles, poisoned/protected status, reminders, history, and night tasks are filtered on the server. A player receives only their shown character and intended messages. Night deaths become public at dawn.
- The current night action is always the earliest unfinished eligible action. Player choices arrive by private chat; the Storyteller selects those choices in the action form. Structured information goes directly to the recipient after confirmation.
- On Night 1, resolving Haunt/Horror introductions also opens a private **Your first-night task** for each recipient. It explicitly identifies their team and the opposing evil team members (Horror → Haunts; Haunts → Horror). The recipient can acknowledge or reopen it, and the same information remains in Messages. This preserves the existing 7+ player introduction rule and the Atheist exception; Horror bluffs and Holy Moon and Stars Celestial information remain included. Introduction tasks disappear at dawn, do not require a target selection, and never block night resolution. Older saves without the optional introduction field remain readable; new task delivery populates it.
- Each night has a randomly selected fun poll from a shared question pool, without repeating the preceding question. Players with no night activity can pick a name while others act. All seated players, including dead players and players with abilities, can participate so poll access never signals a role or hidden night death. Abilities still take priority. One private answer per player can be changed until dawn; polls never hold up night resolution. After dawn, Game flow shows the favorite or tied favorites, without vote counts or voter identities. Questions are shared for meaningful results. Rewind restores the saved poll state. Existing sessions first receive a poll when their next night begins.
- Mobile web uses bottom navigation, touch-sized controls, 16px form text, safe-area spacing, and scrollable dialogs sized to the available viewport. Current Game flow activities appear before the character card on phones.
- Web game actions apply directly: fill any required fields and press the action button. Actions without fields run immediately. There is no preview step. Server authorization, rule checks, and stale-state protection still apply. Messages send directly from the conversation composer without preview or confirmation. Characters with registration flexibility require the Storyteller to enter the appropriate override reason. A poisoned Spy requires a manually supplied replacement Grimoire.
- **Messages** presents a private conversation for each player, with chronological bubbles, timestamps, per-thread drafts, new-message counts during the current visit, and direct Send/Enter-to-send. Shift+Enter adds a line. The Storyteller’s Everyone thread is explicitly public; private threads do not mix other players’ messages. Seats also provides an Open conversation shortcut. Retrying an uncertain send with the same message identifier does not duplicate it.
- **Lobby navigation.** Players see Lobby, Cosmetic, Session Recap, and Rules. Lobby includes the Storyteller, shared seating chart, selected script, session setup. Cosmetic includes appearance and lobby name. Claiming or leaving a seat takes effect immediately; leaving a seat keeps membership. Storytellers no longer reorder seats. Removing someone through the membership API leaves other claimed seats in place. Active-game membership controls still support leaving the table and renaming.
- **Game end and MVP.** The end-game popup shows the winning team and duration from role delivery to victory. Players may cast one final MVP vote for another player; the Storyteller may cast three votes for distinct players. Votes are validated on the server and remain available to participants whose popup is still open after someone returns the group to the lobby. Leave Lobby revokes a player's membership; the Storyteller's Leave Lobby exits the screen while preserving the group.
- **Session recaps.** Returning keeps the group, appearance, and seats and archives each round as Session 1, Session 2, etc. Expand a recap for its final seating diagram, role colors, and MVP counts. Each player opens History, Notes, and Messages. Activity records identify acting/targeted players and include votes, night choices, questions, guesses, and resolved status changes. Notes sync privately during play and all player notes and session messages are revealed after the game. Older saved recaps show only the fields originally recorded; historical device-only notes and missing transcripts cannot be reconstructed. No database migration is required.
- Discovery → Discussion → Nominations, and Defense → Voting, use shared server deadlines. The foreground table automatically checks for updates one second after each completed request. Requests do not overlap, stalled requests time out and retry, and older responses cannot roll back newer actions. Returning to the app or reconnecting triggers an immediate update. After a disconnection the next authenticated request catches up elapsed phases. No background service, push notification, or offline play is promised. Timers do not depend on a particular phone remaining foregrounded, but clients must connect to receive updates.
- Nominations suspend and resume the remaining nomination period. Living players nominate once a day; a target may be nominated once a day. Dead targets and self-nominations are allowed.
- Yes/no votes are public during voting and in the ballot breakdown. The nominee cannot vote. Ballots close when every eligible player answers or the deadline expires. Departed players and dead players with spent votes are excluded; only counted yes votes spend a dead vote.
- Only votes meeting the alive-player majority threshold qualify. A tie at the highest qualifying count blocks execution. The day ends at a Storyteller confirmation step so character effects and win rulings can be reviewed.
- Both scripts use a server-authoritative queued night engine with private choices, Storyteller confirmation, visits, death prevention and redirects, and dawn changes. Character effects and win conditions remain script-specific.
- Storytellers may pause, extend, advance, edit, override, or rewind. Rewinding restores the selected decision and later game changes while retaining messages; it sends a correction and pauses the restored timer. Information already read cannot be erased from a person’s knowledge. Rewinding across player joins is refused to avoid orphaning a device identity.
- Recovery credentials are stored as hashes on the backend, HttpOnly cookies on web, and Keychain items on iOS. They expire after 30 days. Do not share the Storyteller recovery key. Optional Google and Apple accounts can save seats across devices. Explicit provider linking, sign-out, and account deletion are included. See ACCOUNT-SETUP.md to activate providers.

## Holy Moon and Stars

Choose the script in the lobby (**Change role script**). Characters must come from the selected script; random assignment supports both (it never deals the Atheist, though the Storyteller may request one in the role picker).

- **Night order.** Night 1: evil introductions (7+ players; never with an Atheist) → Constellation → Stargazer → Astrologist → Mystic → Astronaut → Prophet → Diviner → Miasma → Grim Reaper → Werewolf → Dreameater → Spirit → Insomniac → queued deaths. Later nights: last night’s plague (the victim dies and their living neighbors are poisoned before anyone acts) → an executed Nightmare chooses whom to haunt → Medium → Gravedigger → Priest → Necromancer → Constellation guess (never Night 1) → Diviner → Miasma → Grim Reaper → Werewolf (kills on Nights 3, 6, 9…) → Dreameater → Spirit → Insomniac → queued deaths. A dead player reached by the Medium acts in their own slot. Dead players act only through the Medium, as the Spirit, or as an executed Nightmare.
- **Player choices.** Players submit choices during the night-choice timer: up to three players, the Diviner’s question, the Dreameater’s guesses, the Constellation’s guesses, or a pass for once-per-game abilities. The Storyteller confirms each task with calculated suggestions (Astronaut distance, Prophet roles, Astrologist characters, Mystic connections, Spirit and Insomniac visits).
- **Choice completion.** When every player with a pending choice confirms or passes, the choice window closes immediately. An executed Nightmare is prompted only after its haunted player submits a targeting choice; that private redirect prompt has its own 60-second deadline and can be confirmed or passed early. The Storyteller remains blocked only while an unanswered choice still has time remaining.
- **Lost Soul information.** A Lost Soul is never told which hidden Villager ability they are simulating or whether its information is correct. Their private result contains only the minimal names, character names, counts, or values needed for the result—for example, `Dreameater, Nightmare` rather than a Prophet explanation.
- **Spirit information.** A living Spirit learns the alignment totals among the distinct players who visited their chosen player, such as `1 evil` and `1 good`; the chosen player’s own alignment is never revealed. With no visitors they learn `0 people.` A dead Spirit learns only the visitor count.
- **Visits.** Any ability that chooses a player visits them (Constellation, Stargazer, Astrologist, Mystic, Medium, Gravedigger, Priest, Necromancer, Spirit, Miasma, Grim Reaper, Werewolf, Nightmare). Redirects land the visit on the final target.
- **Deaths.** Every death goes through one queue, one at a time: redirects first (Dazed, then the Nightmare, resolved on the targeting ability), then prevention (Extra Life; the Celestial protects good players by day), then the Fateweaver may move the death once (the new target is checked again), then the death and its triggers (Constellation link deaths at the Storyteller’s choice, the Zealot’s granted ability, the Priest’s self-revival, Celestial execution, Nightmare execution, Moonshiner). Horror and other night deaths wait until after the Spirit and Insomniac. Day deaths (executions, reaping) resolve immediately; the day cannot end while one is pending.
- **Dawn.** Priest and Necromancer revivals, the Gravedigger’s new character and the Priest’s self-revival apply at dawn with the new alignment. The Medium’s private channel closes at dawn; its transcript stays in the Storyteller log.
- **Hidden and drunk characters.** The Dazed and Moonshiner Fools are shown an out-of-play Villager and are drunk; a Lost Soul is shown the Lost Soul but acts as a hidden Villager. The Zealot’s death still grants the Storyteller an ability while drunk. **Sober up the Fools** reveals real characters at any time. An executed Celestial poisons everyone until the following dusk and makes one Villager drunk for the rest of the game.
- **Zealot.** The Storyteller chooses any script ability and acts with it from the next night, in that character’s slot after any player with the same character. The Storyteller cannot be targeted.
- **Day buttons.** The Astrophage ends the day early (once; not with 4 or fewer living), the Grim Reaper reaps all marks (with confirmation), the Fateweaver sets a preferred redirect, and the Storyteller can record a **Prophet reveal**, which queues the Prophet and a neighbor to die that night.
- **Atheist.** Every player is good. Players may nominate the Storyteller; executing the Storyteller with an Atheist in play wins for good, and two players remaining wins for evil (the Storyteller). Without an Atheist, the Storyteller chooses whether the nominator is executed instead.
- **iPhone.** The native client shows the script name and all Storyteller and day controls. Players on iPhone send night choices to the Storyteller by message.

## Horrors of Fearville

Choose **Horrors of Fearville** in the lobby (**Change role script**). It uses the role breakdown on the script sheet for 5–18 players, including a fifth team: **Travelers** (Executioner, Researcher, Guardian), who are neutral and win in addition to the team result. Key terms (fear, visit, save, learn, declare, neighbor) are defined in the Rules glossary and linked from each role.

- **Night order.** Night 1: evil introductions (7+ players) → Basilisk → Lost Wanderer → Sheriff → Librarian → Teacher → Psychic → Detective → Judge → Sphinx. Later nights: carried fear (Banshee, Monster) takes effect → Basilisk → Lost Wanderer → Doctor → Monster → Wraith → Bodyguard → Detective → Judge → Psychic → Mortician → Sphinx → Watchman → queued deaths.
- **Fear** works like poison: the ability fails silently and information may be false. Basilisk fear lasts the night; an executed Banshee fears every Villager the following night; a Monster kill fears one living neighbor (Storyteller’s choice) the following night. Fear ends at dawn.
- **Visits** are recorded for the whole game. The Watchman sees tonight’s visitors and the Mortician every visitor’s role; a Wraith may choose to stay hidden. The Psychic’s visit is chosen by the Storyteller and must change role type each night (Villager, Fool, Traveler, Haunt, Horror). Visits to the Lost Wanderer’s player may be redirected to one of that player’s neighbors.
- **Deaths.** A Doctor’s save stops every night death on that player (never themselves). The Bodyguard offers their life during the choice window and learns who is attacked; the Storyteller moves one death to them. The Guardian dies in place of their ward, by night or by execution. A Hunter killed at night may take a Haunt with them.
- **Declarations** are public and made from Controls by day: the Vigilante (once per game; the Storyteller rules, the target may die instantly), the Researcher (three living players’ roles; only the Storyteller learns the result until the game ends) and a killed Hag (killed at night → declares the next morning; executed → declares right away). The Hag’s target may die that night only if Good. The Storyteller can record any declaration made aloud.
- **Sphinx.** Each night the Sphinx gets a popup with every player’s role. It disappears when the night-choice timer ends; a feared Sphinx sees a scrambled glimpse.
- **Setup.** The Drunk is shown an out-of-play Villager. The Storyteller confirms the Detective’s false-positive Villager, the Executioner’s target (never the Horror) and the Guardian’s ward when dealing roles.
- **Endings.** Good wins when the Horror dies; evil wins with two players left. Traveler wins are added to the result (for example `Good · Travelers: Sam (Executioner) also win`) and recorded as neutral seats in account stats.
- **iPhone.** The Script tab follows the table’s script, the glossary and role list included; the Sphinx’s glimpse opens as a sheet. Declarations appear in Controls.

## Social system

Signed-in players get a public handle, a friends list, table invitations, a Storyteller rating, and a record of finished games. Guests can still play; everything below requires an account.

- **Handles.** Each account chooses one unique handle (`/friends`): 3–20 lowercase letters, numbers, or underscores. Handles are the only way to find another player; emails are never searchable or shown.
- **Friends.** Send a request by handle; the other player accepts or declines. Two players who request each other become friends immediately. Friends can be removed; blocking removes the friendship, withdraws waiting invitations in both directions, hides your profile from that player, and stops their requests.
- **Invitations.** In a lobby, every seated, signed-in player sees an _Invite friends_ panel on the Game flow tab. Invitations go only to friends, last 24 hours, and lapse when the game starts. The invitee accepts from `/friends` (or the badge on the entry page) and is seated under their account name with the seat saved to their account. Invitation acceptance uses the same join path as the code form, so lobby, capacity, and unique-name rules apply.
- **Recorded games.** Finished games record the final character, alignment, and result for every seat. Records survive session deletion. Writes are idempotent and rewinding out of victory withdraws the record and rewards.
- **Rating the Storyteller.** After a game ends, seated players whose seat is saved to an account can rate the Storyteller 1–5 stars with an optional comment (Game flow tab). Ratings are credited only when the Storyteller's seat is linked to an account, can be revised for 14 days, and count once per player per game. The Storyteller sees stars and comments on `/stats`; comments are never shown to anyone else. Friends see the average.
- **Records.** `/stats` shows progression, character and script results, team results, MVP awards, ranked Elo, and Storyteller feedback. Profiles honor each account’s privacy settings. Neutral Travelers have personal win conditions and their games must be casual.
- **Deletion.** Deleting an account removes its handle, friendships, ratings given and received, invitations, and seat links. Finished games remain in other players' records with that seat no longer linked to any account.
- **API.** `GET/POST /api/social` (actions: `handle`, `request`, `accept`, `dismiss`, `remove`, `block`, `unblock`, `invite`, `acceptInvite`, `declineInvite`, `revokeInvite`, `rate`), `GET /api/social/profile?handle=`, and `GET /api/social/table?code=`. All accept the same account and seat credentials as the existing routes, so the iOS client can adopt them; the SwiftUI app has not been updated for these screens yet.

## iOS and TestFlight

Open `ios/Fearville.xcodeproj` on a Mac. Follow `ios/TESTFLIGHT.md`. The SwiftUI app is a native client, not a web wrapper. A shared scheme and an unsigned simulator CI workflow are included. The project has not been compiled with Xcode in the Windows authoring environment; a Mac build and device checks remain required before distribution.

The deployed entry page is public at https://fearville.phatsyloaf.chatgpt.site. Do not embed a Sites owner bypass token in the iOS app. The session API itself enforces per-seat credentials even when the entry page is public.

## Scope

Horrors of Fearville (default) and Holy Moon and Stars support 5–18 players. Horrors includes neutral Travelers. No arbitrary custom scripts, remote voice chat, or automated Storyteller.

## Validation on the authoring host

- Role assignment and rejoin updates: all 42 unit tests passed, including random setup validation across 5–18 players. Session integration checks passed for preview consistency, manual edits, same-device rejoin, cross-browser recovery, preserved Storyteller permissions, and impersonation rejection. Mobile browser automation verified both users returning after browser closure, both recovery forms, and the Storyteller’s random/manual controls at 320px width. Physical iPhone/Safari checks remain outstanding.
- 18 engine tests, 7 account cryptography tests, and 6 social result-derivation tests passed.
- Multi-client API integration tests (session, accounts, social) passed against the local D1-backed server.
- TypeScript checking, app/domain lint, and the production build passed.
- The unmodified starter component catalog has pre-existing lint findings; `npm run lint` scans that catalog too. The app/domain check is `npx oxlint app lib/game lib/accounts lib/social components/account-panel.tsx components/social db tests`.

## Saved-table compatibility

Tables saved with a retired or missing script identifier are rejected with a clear message to create a new table. Supported tables and finished social records are preserved. No D1 schema migration is needed: script selection lives in `sessions.state` JSON.

## Horrors of Fearville

New tables use this script automatically. Select Holy Moon and Stars with **Change role script** before starting. Horrors uses Fear, Visit, Save, Learn, Declare and Neighbor as defined in the glossary; the Drunk follows an out-of-play shown Villager. Its Sphinx glimpse is private and closes when the night choice window ends. Doctor saves, hidden Wraith visits, carried Monster fear, neutral Traveler goals, and public declarations use the shared queued engine.
