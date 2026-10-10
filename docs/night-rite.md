# FEAR-10: Night Rite implementation

The Storyteller enables Night Rite in the lobby's Flow screen. Existing saved tables without `Game.rite` stay disabled. The setup offers all four patterns, automatic assignment, manual team and pattern overrides, timing, threshold and private completion notifications. Divination-only setup requires a count divisible by three. Every nondeparted seat participates, including dead players. Assignment does not inspect alignment.

Night 2 opens the puzzles. Each interactive night starts with a 30-second view-only lock, which caps the usual night-choice window. The following window lasts 60 seconds. Escape and Laboratory give each member one turn in a hidden, newly shuffled order: 5 seconds for one slide, 8 seconds for one pour, with 750 ms of server-side latency grace. Turn completion hands off immediately; only the active member receives a deadline and turn token. After a turn, the player keeps a frozen snapshot. By day, vigil members see the saved board.

The API at `/api/rite` polls at about 300 ms while interactive. It uses the same game JSON and optimistic database save as `/api/game`, with retries for simultaneous player writes. Player commands use an opaque epoch, night, and current turn/vote token rather than the global table version; unrelated concurrent submissions therefore survive. Storyteller mutations require the current version and save a rewind snapshot. Rewind rotates the epoch, invalidating stale commands. Both endpoints return private, uncached actor-specific views.

Escape uses an exact BFS solver and seeded nonoverlapping layouts. Laboratory starts solved, scrambles by reversible pours, then certifies an optimal A* solution. Two-, three- and four-member vigils have par 8, 12 and 16. Generation runs in resumable request slices before opening, so long searches do not block the night transition. A host redeal prepares a new certified board and opens only that vigil when ready. Other vigils' timers continue. Force close cancels a pending redeal and resolves the currently stored results at dawn. Distances are host-only; a capped search is displayed as uncertified.

Laboratory validates maximal top-run pours, capacity, identical liquids and the monochrome-or-empty goal. After a pour, an exhausted solver search resets to the start of tonight and consumes the turn; a node-cap result is unknown and never declared unsolvable. Undo applies only to tonight's latest pour. Reset returns to the original dealt board. Both require an anonymous unanimous vote by every other member, lasting at most five seconds, with missing answers counted as no. Calling a vote consumes the turn regardless of outcome. Never mind closes the client sheet without issuing a command.

Sphinx generates unique solutions over the 14,400 character/location/activity permutations, verified by its solver. Two-, three- and four-member teams receive exactly 6, 9 and 12 distinct true clues, three each. Dense conjunctions make the six-card case possible. Each member sees one new card per night from the opening night; hidden text is absent from both API payloads. Evil holders receive their own marked false clues with a valid alternative solution as cover. Each player saves a private working map and can replace their complete submission during the window. Dawn requires a strict majority of exact solutions.

Divination deals one shared five-page grimoire with 28 globally distinct symbol sets. The three members form a cycle: each performs a ritual, holds another's omens and keeps the third's grimoire. Each altar has three of the five controls, with 8/6/3/8/3 possible states. Attempts begin on night 3, at most once per night; success persists. Evil-held omens decode to legal wrong states without a visible decoy marker. Only the performer's own success/failure is exposed. Two successful rituals complete the vigil at dawn.

At dawn, at least `ceil(threshold × vigils)` completed puzzles refresh everyone's spent ability flags once, including Evil and Traveler roles and Nightmare/Star Traveler state. Alive/dead eligibility remains governed by the existing role rules. Starting information is queued on the following night for eligible characters in both scripts. Executioner targets, Guardian wards and Constellation links are preserved; their owners receive a reminder. Death-trigger state is left intact for Storyteller rulings. The sole public announcement is “The Rite is complete.” Failed vigils are not announced. No hard cap or hint dealer is enabled; `lib/rite/hints.ts` supplies internal solver/true-target support for future hints.

Web and native SwiftUI include all four puzzles, host setup, voting and private cards. Feedback uses a short red flash, small shake and low sound with audio preferences respected. Reduced motion replaces the shake with a pulse; successful rituals get a gold glow. The new Swift file belongs to the Xcode target and the project generator includes it.

Validation commands:

```powershell
node --experimental-strip-types --test tests/*.test.ts
npx tsc --noEmit
npx oxlint lib/rite components/rite app/api/rite tests/rite.test.ts tests/rite-integration.mjs scripts/rite-design-assets.tsx
npm run build
node scripts/local-api-test-server.mjs
# In a second terminal:
$env:CT_TEST_URL='http://localhost:3001'
node --experimental-strip-types tests/rite-integration.mjs
```

The HTTP suite uses local D1 fixtures and cleans up the test room and account. Unit coverage includes exact par, uniqueness, turn validation, grace/timeout, vote anonymity and unanimous resolution, ritual decoding, dawn majority, reward eligibility, hidden-card redaction, persistence and rewind. Browser checks cover 400-pixel layouts, private draft reload, altar edit preservation during polling, tab navigation and free vote cancellation. Swift syntax can be checked on Windows; the iOS simulator build and device visual checks require Xcode on macOS.
