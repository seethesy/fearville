# Night Rite and Puzzle Room

The Storyteller enables Night Rite in the lobby's Flow screen. Existing saved tables without `Game.rite` stay disabled. The setup offers all four patterns, automatic assignment, manual team and pattern overrides, timing, threshold and private completion notifications. Divination-only setup requires a count divisible by three. Every nondeparted seat participates, including dead players. Assignment does not inspect alignment.

Night 2 opens the puzzles. Each interactive night starts with a 30-second view-only lock, which caps the usual night-choice window. The following window lasts 60 seconds. Escape and Laboratory give each member one turn in a hidden, newly shuffled order: 5 seconds for one slide, 8 seconds for one pour, with 750 ms of server-side latency grace. Turn completion hands off immediately; only the active member receives a deadline and turn token. After a turn, the player keeps a frozen snapshot. By day, vigil members see the saved board.

The API at `/api/rite` polls at about 300 ms while interactive. It uses the same game JSON and optimistic database save as `/api/game`, with retries for simultaneous player writes. Player commands use an opaque epoch, night, and current turn/vote token rather than the global table version; unrelated concurrent submissions therefore survive. Storyteller mutations require the current version and save a rewind snapshot. Rewind rotates the epoch, invalidating stale commands. Both endpoints return private, uncached actor-specific views.

Escape uses an exact BFS solver and seeded nonoverlapping layouts. Laboratory shuffles liquid layers, then certifies an optimal A* solution. The offline catalogue contains 80 Escape entries across four layout simplification budgets and 72 Laboratory entries across 4, 7 and 10 liquids. Each stores its shortest solution. Live requests choose an entry and advance a seeded prefix of that solution: every remaining suffix is still optimal, so different starting positions have exact difficulty without a live search. Cosmetic variation is applied afterward. A host redeal prepares a new certified board and opens only that vigil when ready. Other vigils' timers continue. Force close cancels a pending redeal and resolves the currently stored results at dawn. Distances are host-only; a capped search is displayed as uncertified.

Laboratory validates maximal top-run pours, capacity, identical liquids and the monochrome-or-empty goal. After a pour, an exhausted solver search resets to the start of tonight and consumes the turn; a node-cap result is unknown and never declared unsolvable. Undo applies only to tonight's latest pour. Reset returns to the original dealt board. Both require an anonymous unanimous vote by every other member, lasting at most five seconds, with missing answers counted as no. Calling a vote consumes the turn regardless of outcome. Never mind closes the client sheet without issuing a command.

Sphinx generates unique solutions over the 14,400 character/location/activity permutations, verified by its solver. Each member receives four true clues: two on the opening night, then one on each following night. Hidden text is absent from both API payloads. Easy profiles favor direct, positional and exclusion clues; harder profiles introduce compound, exclusive and cross-category reasoning. Candidate sets are graded against a target number of deduction rounds; this is a best-fit target, not a guaranteed round count. Multiple clue sets can describe the same simple answer. Evil holders receive their own marked false clues with a valid alternative solution as cover. Each player saves a private working map and can replace their complete submission during the window. Dawn requires a strict majority of exact solutions.

Divination deals one shared five-page grimoire with 28 globally distinct symbol sets. The three members form a cycle: each performs a ritual, holds another's omens and keeps the third's grimoire. Each altar has three of the five controls, with 8/6/3/8/3 possible states. Attempts begin on night 3, at most once per night; success persists. Evil-held omens decode to legal wrong states without a visible decoy marker. Only the performer's own success/failure is exposed. Two successful rituals complete the vigil at dawn.

Configured Divination profiles can add ordered inscriptions after symbol decoding: shift a setting, reverse its position in its setting list, or advance it by another control's current setting number. Linked rules depend on earlier controls. These reversible operations preserve a unique decoded target. The performer and their grimoire keeper see the relevant inscriptions; other rituals' targets and private omens remain hidden. Older saved rituals without inscriptions retain direct matching.

## Standalone play and tuning

`/puzzles` offers all four patterns without a table or timer, with Easy, Standard and Hard levels, legal-move controls, undo/reset, optional hints and completion history stored in the browser. A replay link contains the pattern, difficulty, seed and tuning revision. Practice solutions are intentionally available to the local client for checks and hints; the practice API generates independent puzzles and never reads live table state. Practice completion does not award account progression or competitive results.

Authenticated administrators use **Puzzle workshop** in Administration. Choose a profile and pattern, adjust fields, and play an unpublished preview before publishing. Move ranges must increase without overlapping. Laboratory supports 4 liquids up to 9 optimal pours, 7 up to 20, and 10 up to 32, with two spare vials. The board simplification budget selects eligible catalogue families; it is a maximum budget, not an exact number of removed blockers. Sphinx exposes candidate count and target deduction rounds. Divination exposes ordered rule count and linked control count.

Publishing appends an immutable tuning revision and audit entry in one transaction. A stale editor cannot overwrite a newer revision. The additive migration `0016_puzzle_generation.sql` supplies this history. New practice requests use the latest revision unless replaying an explicit edition. Newly configured Night Rites capture the current settings; active puzzles and older saved games are not rewritten by a tuning publication. The default Night Rite profile remains Hard.

Developer defaults and validation live in `lib/rite/generation-settings.ts`. Preserve version-1 defaults and generator behavior when replay compatibility matters; revisions pin settings, not arbitrary future algorithm changes. For deeper offline changes, `BoardGenerationOptions` and `LabGenerationOptions` also expose bounded candidate and solver budgets. Regenerate the catalogue with `node --experimental-strip-types scripts/generate-rite-bank.mjs`; never hand-edit its generated data. Changing supported catalogue families requires updating the runtime validation and workshop limits together. Generation uses seeded randomness and operation limits; wall-clock limits are reserved for optional hints and live distance estimates.

Default optimal movement ranges are 5–9 (Easy), 14–20 (Standard) and 28–32 (Hard). Reasoning tests cover uniqueness, clue-family variation for the same answer, measured progression, reversible inscriptions and private-view redaction. Movement tests verify every stored certificate, exact remaining distances and structural variety independently of skins and liquid colors.

At dawn, at least `ceil(threshold × vigils)` completed puzzles refresh everyone's spent ability flags once, including Evil and Traveler roles and Nightmare/Star Traveler state. Alive/dead eligibility remains governed by the existing role rules. Starting information is queued on the following night for eligible characters in both scripts. Executioner targets, Guardian wards and Constellation links are preserved; their owners receive a reminder. Death-trigger state is left intact for Storyteller rulings. The sole public announcement is “The Rite is complete.” Failed vigils are not announced. No hard cap or hint dealer is enabled; `lib/rite/hints.ts` supplies internal solver/true-target support for future hints.

The shared web UI in browsers and mobile shells includes all four puzzles, host setup, voting and private cards. Feedback uses a short red flash, small shake and low sound with audio preferences respected. Reduced motion replaces the shake with a pulse; successful rituals get a gold glow. The shell loads the same puzzle components as the browser.

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
