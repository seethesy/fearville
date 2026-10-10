# Night Rite v2 — vigils: Escape Fearville, The Sphinx's Riddles, Ritual of Divination, Alchemist's Laboratory

Design draft, revised 2026-10-09 (rev 5: fourth pattern added, **Alchemist's Laboratory** (water sort with timed pours and votes); rev 4: Bomb Defuse replaced by **Ritual of Divination**, where every player has all three tasks for different teammates; rev 3: clue waves removed from the Grid, one clue revealed per night, evil players get extra marked forged clues; Grid is now "The Sphinx's Riddles" with a procedural generator; rev 2: gates removed, 30-second night lock, no connection wait). Extends `night-rite-design.md` (v1: Pairing/Cipher). From v1 this keeps the night-2 opening, the refresh reward and the optional hard cap; its glyph/piece model is replaced by squads. Web app first. "Squad" and "Rite" are placeholder names. **Names now in use:** Town Board = **Escape Fearville** (Jira FEAR-11), Clue Card Logic Grid = **The Sphinx's Riddles** (FEAR-12), Bomb Defuse = **Ritual of Divination** (FEAR-13), water sort = **Alchemist's Laboratory** (FEAR-14), a squad is a **vigil** (2–4 players; Ritual of Divination needs exactly 3). Jira epic: **FEAR-10**.

## Decisions this is built on

1. **Squads (vigils).** Every seat belongs to exactly one squad of 2–4 players (the Sphinx's Riddles supports 2–4; the planner table below was drawn for 3–4 and needs a 2-player revision), and each squad is given one puzzle (Board, Grid, Ritual or Lab). Example at 10 players: Board 4, Grid 3, Ritual 3.
2. **One puzzle per squad, no gates.** A squad's puzzle runs across nights until it is complete. **Once at least 50% of squads have completed their puzzle (`ceil(0.5 × squads)`), the Rite is complete** and the reward is given. A majority-evil squad that never finishes is acceptable.
3. **30-second night lock.** At the start of each night there is a 30-second countdown for players who have night tasks to make their selections. During it, puzzles are **locked but viewable**. When it ends, the puzzles open. There is no waiting for squad members to connect.
4. **Town Board turns.** Players move one at a time in a **randomized order each night** (nobody learns the order). Each gets **1 move per turn, 5 seconds**, otherwise the turn passes. After moving, the board is locked for that player. Control hands off **immediately** using live push updates. The board is saved each night.
5. **Ritual of Divination.** A vigil of exactly 3. **Every** player performs their own ritual at an altar, holds the omens for one teammate and the grimoire for another. They talk **face to face by day**; each performer acts at night. Only 2 of the 3 rituals have to succeed.
6. **Reward (v1):** refresh Good players' once-per-game and start-of-game abilities. Pieces/cards stay active when a player dies. Evil players hold both true and decoy material.
7. **Timing (v1):** the Rite opens on night 2; perfect play completes it at dawn of night 5.

**Interpretations I made (please confirm):**
- (a) One round per night, so a squad of 4 makes 4 board moves a night (`boardRounds`), and there is no total move limit across nights.
- (b) "At least 50%" means `ceil(0.5 × squads)`: 1 of 2, 2 of 3, 2 of 4, 3 of 5.
- (c) The 30 s lock applies to **everyone** (view-only), not only to players with night tasks.
- (d) Squads are privately told when **their own** puzzle completes, never when it has not. This is a change from "results town-wide only"; it leaks nothing about alignment, and the Board shows its own solution anyway. Toggle `notifyCompletion`.
- (e) Board squads can act from night 2 (the Rite opens then). Grid and Ritual need a day of talking first, so their first action is night 3 (`ritualFirstNight`; the Grid can submit from night 2 but cannot be informed before night 4).
- (f) The hard cap "Last Light" (night 8) from v1 is kept as an optional setting. You did not ask for it in this revision, so set `lastLightNight: null` to remove it.

## What the codebase gives us (checked in the repo)

- The client currently polls every **1 s** (5 s when hidden) and keeps a server clock offset, and `tick()` runs on every request. There is **no push channel today**, so immediate turn handoff needs new infrastructure (see "Turn protocol and transport").
- The app is Vinext on Cloudflare Workers with D1. The site also appears to be on a managed hosting platform, so whether Durable Objects and WebSockets are allowed is the main unknown. The protocol is transport-agnostic with a polling fallback.
- The night-choice window is `timers.nightChoice` (default 60 s) and `dawn` is host-triggered after all night tasks. With the Rite on, the night-choice window is capped to `lockSeconds` (30 s) on nights when the Rite is interactive, and dawn also waits for the Rite window.
- State is the `Game` JSON blob with optimistic `version`; `snapshot()` backs undo/rewind. All Rite state lives in `Game.rite`, no SQL tables. `view()` redacts per actor.
- `lib/puzzles/random.ts` gives seeded RNG. New needed: a sliding-block generator/solver, a logic-grid generator/solver, and a ritual generator (grimoire, altars, omens).

## Squads

**Planner (`squadPlan(n)`)**: sizes 3–4, ritual squads exactly 3 (the team planner for FEAR-10 still needs the 2-player Grid revision).

| Players | Squads |
|---|---|
| 6 | Ritual 3, Grid 3 |
| 7 | Ritual 3, Board 4 |
| 8 | Grid 4, Board 4 |
| 9 | Ritual 3, Grid 3, Board 3 |
| 10 | Ritual 3, Grid 3, Board 4 |
| 11 | Ritual 3, Grid 4, Board 4 |
| 12 | Ritual 3, Ritual 3, Grid 3, Board 3 |
| 13 | Ritual 3, Ritual 3, Grid 3, Board 4 |
| 14 | Ritual 3, Ritual 3, Grid 4, Board 4 |
| 15 | Ritual 3 ×3, Grid 3, Board 3 |

**Assignment is seeded-uniform over seats, with no cap on evil per squad.** A cap such as "evil is a strict minority of each squad" forces exactly one evil per squad when there are 3 evil and 3 squads, so every good player would know one of their teammates is evil. Uniform assignment means a squad can have 0, 1 or 2 evil; majority-evil squads fail and the 50% rule absorbs them. An optional `evilCap` exists, off by default.

Squad rosters are known to members (they meet by day), unknown to others unless told. Dead players stay members and keep acting.

## Shared model

```ts
// lib/rite/types.ts (v2). Glyph/Piece types from v1 are removed.
export type SquadKind = 'board' | 'grid' | 'ritual' | 'lab';

export type RiteConfig = {
  enabled: boolean;
  opensNight: number;           // 2
  completeThreshold: number;    // 0.5; needed = ceil(threshold × squads)
  lockSeconds: number;          // 30, view-only countdown at the start of each interactive night
  windowSeconds: number;        // 60, Grid/Ritual submissions close this long after the lock ends
  boardFirstNight: 2 | 3;       // 2 (see pacing)
  boardRounds: number;          // 1 round per night
  boardMoveMs: number;          // 5000, server-stamped per turn
  boardGraceMs: number;         // 750, latency allowance on accepting a move, never shown
  transport: 'push' | 'poll';   // 'push' = WebSocket room; 'poll' = ~300 ms polling fallback
  gridCluesPerPlayer: number;   // 3. Every member holds this many true clue cards; total true clues = 3 × members (6, 9 or 12)
  gridRevealPerNight: number;   // 1. One true clue per member is revealed at the start of each night from `opensNight` (nights 2, 3, 4)
  gridForgedPerEvil: number;    // 1. Extra forged clues an evil member holds, on top of the 3 true ones (clearly marked, evil-only)
  labFirstNight: 2 | 3;         // 2, like the Board
  labRounds: number;            // 1 round (one pour per member) per night
  labTurnMs: number;            // 8000 (longer than the Board's 5 s: a pour takes two taps), server-stamped per turn
  labVoteMs: number;            // 5000, vote window (the vote ends the caller's turn)
  labGraceMs: number;           // 750, latency allowance on accepting a pour, never shown
  ritualFirstNight: number;     // 3. Altars can be performed from this night (the day before is for talking)
  ritualAttemptsPerNight: number; // 1
  ritualNeeded: number;         // 2. Rituals (of 3) that must succeed for the vigil to complete
  pity: boolean;                // hint cards while the Rite is incomplete
  hintsFromNight: number;       // 5, the earliest night perfect play can finish
  lastLightNight: number | null;// 8; null = no cap
  evilCap: 'off' | 'minority';
  notifyCompletion: boolean;    // private "your squad's puzzle is complete" notice
};

export type Squad = {
  id: string;
  kind: SquadKind;
  members: string[];            // player ids; dead players stay members
  completeNight?: number;       // server-only until notified
  state: BoardState | GridState | RitualState | LabState;
};

export type HintCard = {
  id: string; holder: string; squad: string;  // dealt to a seat OUTSIDE the squad
  text: string;                               // true fact about that squad's puzzle
};

export type RiteState = {
  config: RiteConfig;
  status: 'dormant' | 'open' | 'complete';
  squads: Squad[];
  hints: HintCard[];
  lock?: { night: number; until: number };                  // server clock ms
  window?: { night: number; start: number; end: number };
  resolvedNight: number;        // idempotence guard for dawn
  completedNight?: number;
  reward?: { night: number; refreshed: { player: string; role: string; kind: 'once' | 'start' }[] };
};
```

`Game` gains `rite?: RiteState`. `Notebook` keeps the v1 private `rite` ledger for free-form notes.

### Night flow

```
Night 2 start     riteOpen(): plan squads, deal puzzles
                    Board: full board.  Grid: clue cards dealt (all hidden).  Ritual: altars, omens and grimoire dealt.
Every night       lock.until = nightStart + 30 s
 (from night 2)     Grid: reveal each member's next hidden clue (night 2: clue 1, night 3: clue 2, night 4: clue 3)
                  LOCK (30 s): every puzzle is view-only for everyone.
                    Players with night tasks make their selections (night choices).
                  OPEN: the lock ends and the window opens.
                    Board / Lab: turns run back to back, immediate handoff.
                    Grid / Ritual: submissions accepted until window.end.
Dawn              blocked until every Board and Lab has finished its turns and window.end has passed.
                  riteResolve():
                    per squad: set completeNight if its completion rule is met
                    if completeSquads >= ceil(threshold × squads): status = complete, applyReward()
                    else if night == lastLightNight: status = complete (cap), applyReward()
                    else if night >= hintsFromNight and pity: deal hint cards
Day               squads talk.
```

On night 2 only Board squads can act (see decision (e)). Dealing at dawn means a card dealt at dawn of night N is discussed during Day N and used on night N+1.

### Completion rules and perfect-play timeline

| Pattern | Deal schedule | Completes when | Earliest (perfect) |
|---|---|---|---|
| Board | whole board at night 2 | the key block exits (checked per move, recorded at dawn) | dawn of night 5, par = members × rounds × 4 |
| Grid | clue cards dealt at night 2; one clue per member revealed each night (nights 2, 3, 4) | a majority of members submit the exact solution on any night | night 5: the last clue is revealed on night 4, the vigil pools all clues on day 5 and submits on night 5 |
| Lab | whole puzzle at night 2 | every vial holds one liquid or is empty (checked after each pour, recorded at dawn) | dawn of night 5, par = members × rounds × 4 |
| Ritual | altars, omens and grimoire dealt at night 2 | at least 2 of the 3 members have performed their own ritual correctly (one attempt per member per night, from `ritualFirstNight` = 3) | night 3 with perfect play; a mistake or a sabotaged night adds a night. Raise `ritualFirstNight` to hold perfect play near night 5 |

The reward is unchanged from v1 (refresh `used` flags at dawn and queue start-of-game info tasks for the next night).

### Hint cards (pity)

From dawn of night 5 onward, while the Rite is incomplete, **every** squad's puzzle gets one hint card each dawn, dealt to a random seat **outside** that squad. Dealing for every squad (including squads that already completed privately) means receiving a hint tells you nothing. Holders must find the right squad and pass the hint on by talking, so evil holders can withhold or lie. Hint content is always a true fact:

| Pattern | Hint |
|---|---|
| Board | One optimal move from the current saved state |
| Grid | One fact from the solution ("The Doctor was at the Market") |
| Lab | One optimal pour from the current saved state |
| Ritual | One true target for one of the members' controls ("Mara's chalice must be full") |

## Pattern A — Town Board (sliding blocks)

**Puzzle:** a 6×6 board, blocks of length 2–3 sliding along their axis, one key block that must exit on its row. A move slides one block any distance in one go. The generator solves with BFS and keeps only boards whose optimal solution (`par`) equals `members × boardRounds × perfectNights`, where `perfectNights = 5 − boardFirstNight + 1` (4 with a night-2 start: par 16 for four players, 12 for three).

```ts
export type Block = { id: string; x: number; y: number; len: 2 | 3; dir: 'h' | 'v'; key?: boolean };

export type BoardState = {
  size: number;                  // 6
  exitRow: number;
  blocks: Block[];               // saved at last dawn (what members see by day)
  par: number;
  dist: number;                  // optimal moves from the saved state (server-only, BFS at dawn)
  solved?: boolean;              // set the moment the key block exits; further turns are skipped
  night?: {                      // tonight only
    order: string[];             // randomized, seeded per night (host only)
    cursor: number;              // index into order; order.length = finished
    turnStart: number;           // server ms when the current player received the board
    turnDeadline: number;        // turnStart + boardMoveMs (server-authoritative)
    live: Block[];               // board after the last applied move
    log: { player: string; at: number; kind: 'move' | 'pass' | 'timeout';
           block?: string; x?: number; y?: number }[];   // host only
  };
};
```

**Sabotage and cover:** moves are anonymous and the order is secret, so a bad move cannot be attributed. An evil player can make a wasteful move, undo a teammate's progress, or pass and claim a timeout. Good players can also blunder in five seconds, which gives evil natural cover. The day's plan is where lying happens, and the host's log is the only place authorship is visible. A solved board is visible to its members (that is intrinsic to the puzzle).

### Turn protocol and transport (immediate handoff)

The turn logic is one small state machine, independent of how messages travel. There is **no connect-wait**: turns start the moment the lock ends.

1. **Lock ends.** The server draws `order` (seeded per night) and sends the first player a `turn` message with the board as it stands now and a server-stamped `turnDeadline = turnStart + 5000`. The client counts down using the server clock offset it already keeps. Everyone else receives nothing.
2. **Handoff.** A legal `move`, a `pass`, or the deadline passing (timeout) immediately advances `cursor` and sends the next player their `turn`. There is no idle gap.
3. **Offline or absent players** simply time out after 5 s, so the worst case for a squad of four is about 20 s.
4. **Acceptance.** A `move` is accepted if it is legal and `now <= turnDeadline + boardGraceMs` (750 ms latency allowance, never shown). Illegal moves are rejected and the timer keeps running. `pass` and timeout look identical to everyone.
5. **Locked.** After their turn, a player gets only a **locked snapshot** (the board as of their own move), never later boards, so nobody can watch the board change and work out who moved when.
6. **Waiting screens show no countdown or position.** An ETA would reveal turn order.
7. **Finish.** When `cursor` reaches the end (or the key block exits), the board is saved as `blocks` and the squad is marked done for the night. The host's dawn waits for every Board squad.

**Transport:**

| Option | How | Notes |
|---|---|---|
| **Push (recommended)** | A Durable Object per session code (`RiteRoom`) holds the turn state machine, runs turn deadlines with alarms, and talks to clients over hibernating WebSockets. The Worker authenticates the upgrade with the existing member token (`auth()`), then forwards the player id to the room. | Needs host support for Durable Objects and WebSockets, and a custom Worker entry that re-exports the room class beside Vinext's fetch handler. Spike this first. |
| **Poll fallback** | The same state machine lives in `Game.rite` and advances inside `tick()` (which already runs on every request). Squad members poll a lightweight turn endpoint about every 300 ms during their window; other players keep normal polling. | Works anywhere. Handoff takes about 0.3–0.6 s. Hidden tabs throttle polling to about 5 s, so use a screen wake lock and a "stay on this screen" prompt. Each move is a version-checked `save()`. |

```
client → room   { t: 'move', block, x, y } | { t: 'pass' }
room → client   { t: 'wait' } | { t: 'turn', board, deadline, serverNow }
                | { t: 'locked', board } | { t: 'done' } | { t: 'error', msg }
```

**Persistence:** the room keeps tonight's turn state in its own storage (so a restart cannot lose a turn) and commits one consolidated update to `Game.rite` when the squad finishes, guarded by `resolvedNight` so a retry is idempotent. A host undo or rewind bumps a `riteEpoch` so a stale room discards its state. With push in place, the room could later also broadcast a `changed` signal that replaces 1 s polling for the whole app.

### Board pacing (arithmetic, not simulated)

Squad of 4, one round (4 moves) per night, one evil player.

| Scenario | Distance after each night | Completes |
|---|---|---|
| Night-2 start (par 16), all good | 12, 8, 4, 0 (nights 2–5) | night 5 |
| Night-2 start, 1 evil always wastes a move (+1, net −2) | 14, 12, 10, 8, 6, 4, 2, 0 (nights 2–9) | night 9 |
| Night-2 start, 1 evil only passes (−3) | 13, 10, 7, 4, 1, 0 (nights 2–7) | night 7 |
| Night-3 start (par 12), 1 evil always wastes | 10, 8, 6, 4, 2, 0 (nights 3–8) | night 8 |
| 2 evil of 4 | no net progress | never; relies on the 50% rule and hints |

A night-2 start overshoots night 8 by one night under constant sabotage, so either use `boardFirstNight: 3` or keep Last Light.

## Pattern B — The Sphinx's Riddles (Clue Card Logic Grid)

**Puzzle:** a town map with five fixed locations. The vigil has to work out which **character** was at which **location** doing which **activity**. There are **no clue waves**. Every member holds 3 true clue cards from night 2, but the cards are **hidden until revealed**: one clue is revealed per night starting with night 2, so all 3 are revealed by night 4. Hidden cards show as visibly locked placeholders, and the clue text is never sent to the client before its reveal. UI template: `docs/design/sphinx-riddles.png` (Jira ticket for this puzzle).

**Constant categories and entities (the same every game):**

| Category | Entities (icon) |
|---|---|
| Characters | Watchman (purple eye), Doctor (red cross), Librarian (blue books), Detective (yellow magnifying glass), Mortician (gray skull) |
| Locations | Library, Garden, House, Market, Graveyard |
| Activities | Reading (book), Eating (apple), Biking (bike), Shopping (basket), Sleeping (pillow) |

Only the **solution** and the **clues** vary between games, so nothing can be memorized. A solution assigns each character exactly one location and one activity (5 triples, `5! × 5! = 14,400` possible solutions).

**Procedural generator.** Codex builds a seeded generator that picks a random solution and then creates **3 clues for each player in the vigil**. A vigil has 2–4 players, so the **true clue set has 6, 9 or 12 clues**, and every such set must have **exactly one solution**.

- The generator runs a solver (it counts solutions) and rejects any clue set that is ambiguous or contradictory. The count must be exactly 1.
- Clue density scales with vigil size. A 6-clue set cannot be built from simple statements alone (each simple clue carries only 1–2 bits and the puzzle needs about 14), so the clue vocabulary must include **dense clues** (for example "the Detective was at the Library, and was Reading" links two entities in one card) used more heavily for small vigils. 12-clue sets can use simpler clues.
- Clue types: positive and negative links between any two categories, either/or, and conjunction clues. No ordering clues (nothing here is ordered).
- Clues are dealt so every player holds exactly 3, with no duplicates across the vigil. The reveal order (which of a player's three clues appears on night 2, 3 or 4) is random per player.

```ts
export type Ent = { cat: 'character' | 'location' | 'activity'; id: string };
export type Clue = {
  id: string;
  kind: 'is' | 'isNot' | 'either' | 'both';   // 'both' = conjunction (dense)
  refs: Ent[];                                // 2–3 entities
  text: string;                               // "The Detective was not at the Graveyard, nor Shopping."
  forged?: boolean;                           // visible to the holding (evil) member and the host only
};

export type GridState = {
  solution: { character: string; location: string; activity: string }[];  // host only, 5 triples
  clues: Clue[];                              // host only: 3 true per member (6 / 9 / 12) plus forged extras for evil members
  cards: { id: string; holder: string; clue: string; revealNight: number; forged?: boolean }[];  // holder sees {id, text, forged} only once night >= revealNight
  placements: Record<string, { character: string; location?: string; activity?: string }[]>;  // latest per member
  submissions: Record<string, { character: string; location: string; activity: string }[]>;
};
```

**Evil forged clues:** an evil member holds their 3 true clues **plus extra forged clues** (`gridForgedPerEvil`, default 1). Forged clues are **clearly marked as forged on the evil player's own screen** (only they and the Storyteller see the mark), so an evil player is never confused about which clue is false; good players never receive forged clues. The earlier "forging with cover" idea applies: choose a wrong solution `S′` that differs slightly from the truth `S`, and make each forged clue true in `S′` but false in `S`, so it looks plausible next to the true clues. Forged clues never change the uniqueness of the true set. The evil player decides whether and how to share a forged clue; it is not revealed on the night schedule, it is available to them from night 2.

**Submission and completion:** every member can submit a full solution on any night (replacing their previous submission); the vigil completes the first dawn on which a **majority** of members' latest submissions equal the solution (≥ 2 of 3, ≥ 3 of 4, and 2 of 2 for a pair). One evil member alone cannot flip a vigil of 3 or 4.

**UI:** a town map with the five locations, each with an empty character circle and a smaller overlapping activity circle; draggable character tokens (each with its own activity slot) and activity icons in a tray under the map; the player's own 3 clue cards in a list below (hidden cards are shown as locked placeholders until revealed; forged cards are marked on an evil player's screen). See the template image.

**Optional helper (later):** a client-side clue entry form that runs the solver and shows "consistent / contradiction / ambiguous". It runs on the device, so it leaks nothing.

## Pattern C — Ritual of Divination

**Puzzle:** a vigil of **exactly 3** players. Every player has **all three jobs, each for a different teammate**, so there is no spare player to rely on. With members `[m0, m1, m2]` in a fixed (seeded) cyclic order, for the ritual performed by `m(k)`:

- **performer:** `m(k)` sets their own altar (the ritual);
- **omens holder:** `m(k−1)` sees that ritual's omens;
- **grimoire keeper:** `m(k+1)` decodes them with the grimoire.

Example: A holds the omens for B and keeps the grimoire for C, and also performs their own ritual. UI template: `docs/design/ritual-divination.png` (Jira FEAR-13).

| Card | What the player has | What they do |
|---|---|---|
| **Altar** | 3 of the 5 controls, chosen at random per player | performs their own ritual at night |
| **Omens** (for one teammate) | 3 sets of 3 symbols, **unlabeled**, one set per control on that teammate's altar | reads each set aloud to the teammate who keeps that teammate's grimoire |
| **Grimoire** (for the other teammate) | the vigil's book, 5 pages (one per control) | decodes the omens they hear and tells that teammate what to set |

**Controls (5), 28 states in total:**

| Control | States | Count |
|---|---|---|
| Candles | red, white, purple, each lit or unlit | 8 |
| Offerings | bone, feather and herb placed one per slot across 3 slots | 6 (3!) |
| Chalice | low, half, full | 3 |
| Moon dial | marks I to VIII | 8 |
| Incense | unlit, smoldering, blazing | 3 |

**Symbols (8):** skull, skull and crossbones, waning crescent, waxing crescent, flying crow, perched crow, triangular hourglass, curvy hourglass. The look-alike pairs are deliberate: players have to describe them carefully to each other.

**Grimoire rules:**

- An omen set is **3 different symbols, order does not matter**: `C(8,3) = 56` possible sets.
- The grimoire has 5 pages, one per control. Each page maps a set to one state of that control.
- Omens are unlabeled, so a set must identify its control and its state by itself. **Every set therefore appears at most once in the whole book**: 28 distinct sets for the 28 states (of 56 available). *(Interpretation of "a unique set per state", please confirm.)*
- The book is **identical for the whole vigil**: every member holds a copy, and "keeper for X" is the responsibility to decode for X, not exclusive access. Anyone can check a decode if they know the omens.
- The book is drawn per vigil, seeded, so it cannot be memorized between games.

**Simplification:** a player's altar has only 3 of the 5 controls, so each ritual needs only 3 omen sets and one lookup per control. Complexity comes from memory and communication (who holds what), not from hard decoding.

```ts
export type Sym = 'skull' | 'bones' | 'waning' | 'waxing' | 'crowFly' | 'crowPerch' | 'hourTri' | 'hourCurvy';
export type Control = 'candles' | 'offerings' | 'chalice' | 'dial' | 'incense';
export type Item = 'bone' | 'feather' | 'herb';
export type ControlState =
  | { control: 'candles'; lit: [boolean, boolean, boolean] }          // red, white, purple
  | { control: 'offerings'; slots: [Item, Item, Item] }               // a permutation
  | { control: 'chalice'; level: 'low' | 'half' | 'full' }
  | { control: 'dial'; mark: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
  | { control: 'incense'; state: 'unlit' | 'smoldering' | 'blazing' };

export type GrimoirePage = { control: Control; entries: { set: Sym[]; state: ControlState }[] }; // set: 3 distinct symbols, stored sorted

export type Ritual = {
  performer: string; omensHolder: string; keeper: string;   // cyclic roles
  controls: Control[];            // the 3 controls on this player's altar
  target: ControlState[];         // host only, one per control
  omens: Sym[][];                 // 3 sets, shuffled order, derived from target + book. Sent to omensHolder only
  altar: ControlState[];          // performer's current setting (private working state)
  attempts: { night: number; ok: boolean }[];   // server-only (ok also hidden from non-host)
  doneNight?: number;             // set the night the ritual is performed correctly
  kit?: { decoyOmens: Sym[][] };  // evil omens holder only: valid sets that map to legal wrong states
};

export type RitualState = {
  members: string[];              // exactly 3, cyclic order
  book: GrimoirePage[];           // identical for all members
  rituals: Record<string, Ritual>;  // keyed by performer
  done: number;                   // rituals performed correctly (server-only)
};
```

**Sabotage surface:**
- **Evil omens holder:** reads `kit.decoyOmens`, valid sets that decode to legal wrong states, so the keeper finds a plausible instruction. Nobody else knows the true omens.
- **Evil keeper:** simply decodes wrongly. The book is the same for everyone, so a lie can be caught if the omens were said aloud in front of the third player.
- **Evil performer:** sets the altar wrongly on purpose. The failure is indistinguishable from a good player's mistake.
- Evil's decoy kit lives in the same private notes area every card has, so showing a screen reveals nothing extra.

**Attempts and feedback:** each performer has **one attempt per night** (`ritualAttemptsPerNight`), from `ritualFirstNight`. They set all three controls and press "Perform the ritual". The server compares to `target` at once:
- **Wrong:** the altar shows a **brief red flash (about 400 ms), a slight screen shake (a few small side-to-side jolts) and a low error sound**, with the line "The ritual falters". Nothing says which control was wrong. The altar is sealed until the next night.
- **Right:** a calm gold glow and "The ritual is performed". The altar stays sealed as complete. Only the performer is told; they can tell the others or lie.

**Completion:** at dawn the vigil is complete once `done >= ritualNeeded` (2 of 3). A completed ritual stays complete. Rituals keep being attempted nightly until the Rite is complete.

**Pacing:** with perfect play the first attempts happen on night 3, so a clean vigil can finish at that dawn. Real play will usually take a night or two more (a mistaken lookup costs a night). Set `ritualFirstNight` to 4 or 5 to keep perfect play near night 5, as with the other patterns.

**Known limit (please read):** the omens for a ritual are held by one person. A single evil member always has someone downstream, so they can ruin their **own** ritual and the ritual whose omens they hold, which leaves at most 1 of 3 complete. So "2 of 3" absorbs honest mistakes, but one determined evil member can still block the vigil. Options if you want real leeway: (1) show each omen set to both teammates so the keeper can check the omens holder; (2) deal hint cards that confirm one true target; (3) accept it and rely on the 50% rule across vigils. See open question 5.

## Pattern D — Alchemist's Laboratory (water sort)

**Puzzle:** a rack of vials, each holding up to 4 layers of liquid. A turn is **one pour** (or a vote). The vigil wins when **every vial holds a single liquid or is empty**. UI template: `docs/design/alchemist-laboratory.png` (Jira FEAR-14). Vigils of 2–4 players.

**Pour rule (standard water sort):** the top run of identical liquid in a vial moves onto a vial that is empty, or whose top liquid is the same and which has room. It moves as much of the run as fits.

**Vials and liquids (cosmetic variety, uniform rules):** every vial holds 4 units; the shape is only art (beaker, Erlenmeyer flask, round-bottom flask, test tube, graduated cylinder, potion bottle, rounded beaker). A liquid is a **color and a substance together** (green with eyes, red with bubbles, blue with stars, purple with smoke, yellow with lightning, teal with fish, pink with spirals, black ink with runes); only identical liquids merge. The substance also keeps colors apart for colorblind players. The standard board has 10 vials (8 liquids and 2 empty), but the generator may use fewer liquids so the optimal solution fits the par (below).

**Turns (same machine as the Board):** a randomized hidden order each night, **8 seconds** per turn (`labTurnMs`; longer than the Board because a pour takes two taps), immediate handoff, a locked snapshot after your own turn, no countdown or position shown while waiting, pour accepted up to `labGraceMs` after the deadline, timeouts look like passes. After a legal pour the turn ends. If the board is solved, the remaining turns are skipped.

**Calling a vote (undo or reset):** on their turn a player can call a vote instead of pouring.
- **Undo** takes back the most recent pour **made tonight** (the Undo button is disabled when there are none). **Reset** returns the whole puzzle to the **original** puzzle as dealt. There is **no limit** on votes.
- Calling a vote **uses the caller's turn**. The turn timer **pauses**, and every other member gets a prompt with Yes and No and **5 seconds** to answer (`labVoteMs`). The window ends early once everyone has answered.
- It passes only if **every** other member votes yes. A missing vote counts as no.
- Votes are anonymous. Everyone sees only "passed" or "failed". The vote prompt does reveal that whoever was on turn called it, which is accepted.
- Whether it passes or fails, the caller's turn is over when the vote completes, and the next turn starts at once.
- Undo never reaches back to a previous night's pours; Reset always returns to the original puzzle.

**Unsolvable states:** after every pour a solver checks whether the puzzle can still be solved. If not, the vigil gets the "brew is ruined" feedback (red flash, slight screen shake, error sound) and the puzzle **resets itself to the start of tonight**. The pour that caused it still counts as that player's turn, and the turn order continues.

**Par and difficulty:** the generator scrambles from a solved state and keeps only puzzles whose optimal solution (BFS or A* over pours) equals `members × labRounds × perfectNights`, as for the Board (par 8 for two players, 12 for three, 16 for four with a night-2 start). Smaller vigils therefore get fewer liquids and a lighter scramble. Every dealt puzzle and every start-of-night state is verified solvable.

```ts
export type Liquid = 'green' | 'red' | 'blue' | 'purple' | 'yellow' | 'teal' | 'pink' | 'ink';
export type VialShape = 'beaker' | 'erlenmeyer' | 'roundFlask' | 'testTube' | 'cylinder' | 'potion' | 'roundedBeaker';
export type Vial = { id: string; shape: VialShape; layers: Liquid[] };   // bottom to top, up to 4

export type LabState = {
  vials: Vial[];                 // saved at last dawn (what members see by day)
  start: Vial[];                 // the original puzzle, target of a reset
  par: number;
  dist: number;                  // optimal pours from the saved state (server-only)
  history: { night: number; from: string; to: string; n: number }[];   // every pour; undo may only pop entries from tonight
  solved?: boolean;
  night?: {
    order: string[]; cursor: number;       // randomized, seeded per night (host only)
    turnStart: number; turnDeadline: number;
    nightStart: Vial[];                    // state at the start of tonight (auto-reset target)
    live: Vial[];
    vote?: { kind: 'undo' | 'reset'; caller: string; deadline: number;
             ballots: Record<string, boolean>; remainingTurnMs: number };   // host only
    log: { player: string; at: number; kind: 'pour' | 'pass' | 'timeout' | 'vote' | 'ruined';
           from?: string; to?: string; result?: 'passed' | 'failed' }[];   // host only
  };
};
```

**Sabotage and cover:** pours are anonymous and the order is secret. An Evil player can make a wasteful pour, call pointless votes (each costs a turn and stalls the vigil), or vote no. Good players also blunder in eight seconds, which gives cover. Because a vote needs every other member to agree, one saboteur can veto any undo or reset; votes are anonymous so a veto does not identify them.

## Commands (engine `execute`) and visibility

| Actor | Action | Payload |
|---|---|---|
| player | `riteBoardMove` | `{ block, x, y }` or `{ pass: true }` (push: `move` / `pass` messages) |
| player | `riteGridSubmit` | `{ solution: {character, location, activity}[] }` (replaces earlier submission) |
| player | `riteLabPour` | `{ from, to }` (current turn only) |
| player | `riteLabCall` | `{ kind: 'undo' \| 'reset' }` (current turn only; uses the turn and starts a vote) |
| player | `riteLabBallot` | `{ yes: boolean }` (members other than the caller, while a vote is open) |
| player | `riteRitualPerform` | `{ altar: ControlState[] }` (performer only; one attempt per night; rejected before `ritualFirstNight`, during the lock, once done, or after tonight's attempt) |
| player | `riteNote` | free-form private note |
| host | `riteLock` | skip or extend tonight's lock |
| host | `riteForce`, `riteRedeal`, `riteHint` | mark a squad complete/incomplete, re-deal, or hand out a hint |

Puzzle input commands are rejected while `now < lock.until`.

| Data | Owner | Other squad members | Everyone else | Host |
|---|---|---|---|---|
| Board (saved) | members | members | no | yes |
| Own move / locked snapshot | mover | no | no | yes |
| Move log, order, `dist` | none | no | no | yes |
| Lab board (saved) | members | members | no | yes |
| Lab live board, own pour | mover | no | no | yes |
| Lab ballots, order, history, log | none | no | no | yes |
| Clue cards | holder | no | no | yes |
| Forged clues, solution | none | no | no | yes |
| Altar, omens, decoy omens | performer sees own altar; omens holder sees omens (decoys only if evil) | no | no | yes |
| Grimoire | every member (identical book) | yes | no | yes |
| Ritual targets, attempts | none | no | no | yes |
| Hint card | holder | no | no | yes |
| Squad completion | members (if `notifyCompletion`) | | no | yes |
| Rite complete | all | | | |

The Spy (both scripts) must not see any Rite data beyond what a normal seat sees.

## UI sketches (400 px phone first)

### A. Squad header and night lock (all patterns)

```
 DAY / NIGHT (open)             NIGHT, FIRST 30 s (locked, view-only)
┌─────────────────────────────┐ ┌─────────────────────────────┐
│ ☾ THE RITE       Day 3      │ │ ☾ THE RITE      Night 4     │
│ YOUR SQUAD · Board          │ │ 🔒 Opens in 0:23            │
│  Dana · Raj · Kit · you     │ │ Make your night choice first│
└─────────────────────────────┘ │ YOUR SQUAD · Board          │
                                └─────────────────────────────┘
```
Night choices take screen priority during the lock; the puzzle sits underneath, readable but not interactive.

### B. Town Board — day (read-only saved board)

```
┌─────────────────────────────────────┐
│ ┌─┬─┬─┬─┬─┬─┐                       │
│ │▓│ │░░│░░│ │   (6×6 board, key     │
│ │▓│ │ │ │▒│    block in red,        │
│ │K K→       exit marker on right)   │
│ └─┴─┴─┴─┴─┴─┘                       │
│ Saved at dawn. Plan your moves.     │
│ [ Notes: who moves what ]           │
└─────────────────────────────────────┘
```

### C. Town Board — night, waiting / your turn / locked

```
 WAITING                   YOUR TURN                 LOCKED
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ The town sleeps.  │    │  ◔ 0:03           │    │ Your move is in.  │
│ Your turn is      │    │  [  board, drag   │    │ [ board snapshot, │
│ coming…           │    │   a block ]       │    │   read-only ]     │
│ (stay on screen)  │    │  [ Pass ]         │    │ Wait for dawn.    │
└───────────────────┘    └───────────────────┘    └───────────────────┘
```
The screen switches to YOUR TURN the instant the previous player finishes. The ring counts down to the server's `turnDeadline`. A timed-out player sees the locked screen with "Your turn passed", worded identically to a pass. The waiting screen has no countdown, because an ETA would reveal turn order.

### D. The Sphinx's Riddles — day and night

See the template `docs/design/sphinx-riddles.png`: map with five named locations (each with a character circle and an overlapping activity circle), a character tray and an activity tray, and the player's own three clue cards below. Clues not yet revealed show as visibly locked placeholder cards (no clue text); evil players also see their extra clues marked FORGED.

### E. Ritual of Divination — altar, omens, grimoire

See the template `docs/design/ritual-divination.png`. Bottom tabs: **Altar**, **Omens (teammate name)**, **Grimoire (teammate name)**.

- **Altar:** the three controls this player has (candle toggles, offering slots, chalice level, moon dial, incense selector, in whatever combination was dealt), a "Perform the ritual" button and a line saying who holds your omens and who keeps your grimoire. One attempt a night. Failure shows a red flash, a slight screen shake and an error sound ("The ritual falters"); the altar then reads "Sealed until night N+1".
- **Omens:** three unlabeled sets of three symbol discs, numbered I to III, with a note that order inside a set does not matter.
- **Grimoire:** five page tabs (one icon per control) and the list of sets with the state each one means.
- During the 30 s lock all three tabs are view-only.

### E2. Alchemist's Laboratory

See the template `docs/design/alchemist-laboratory.png`. Five screens: **your turn** (timer ring, the rack of vials, Undo and Reset buttons, tap a vial then a target to pour), **call a vote** (bottom sheet: undo or reset, with a "never mind" that costs nothing), **a vote is called** (what the others see: question, 5 s countdown, Yes and No), **locked after your turn** (read-only snapshot), and **an unsolvable brew** (red flash, shake, message). Vote results are one line for everyone: "The vote passed" or "The vote failed". During the 30 s lock the board is view-only.

### F. Completion

```
 Public, at dawn                          Private to a squad (positive only)
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ ☾ The Rite is complete.       │        │ Your squad's puzzle is        │
│   The town's gifts return.    │        │ complete.                     │
└───────────────────────────────┘        └───────────────────────────────┘
```
There is no public per-night result and no failure message anywhere.

### G. Storyteller — Rite board

```
┌────────────────────────────────────────────────────────────────┐
│ RITE · Night 4 · lock 0:12 · need 2 of 3 squads complete        │
├─────────┬──────────────────────┬──────────────┬─────────────────┤
│ Squad   │ Members              │ This night   │ Progress        │
├─────────┼──────────────────────┼──────────────┼─────────────────┤
│ Board   │ Dana Raj Kit* Sam    │ 3 moves, 1   │ dist 8 / par 16 │
│         │                      │ pass         │                 │
│ Grid    │ Mei Tom Ava*         │ 2 of 3 right │ 9 clues dealt   │
│ Lab     │ Pia Ned Ora*         │ 2 pours,     │ dist 7 / par 12 │
│         │                      │ 1 vote failed│                 │
│ Ritual  │ Lou Eli Joy          │ 1 attempt, 0 │ 1 of 3 done    │
│         │                      │ right        │ (need 2)        │
├─────────┴──────────────────────┴──────────────┴─────────────────┤
│ * evil.  Complete: 0 of 3.  Projection: Board night 7           │
│ [ Skip lock ] [ Extend 30 s ] [ Mark complete ] [ Hint ]        │
└────────────────────────────────────────────────────────────────┘
```
The host also sees the Board move log and the Lab pour and vote log with authorship and order (including how each member voted), forged clues, each ritual's targets, omens, decoy omens and attempts, and hint cards.

## Files to add or change

- New: `lib/rite/{types,squads,board,grid,ritual,lab,resolve,hints,reward,view,turns}.ts` (`turns.ts` is the transport-agnostic turn state machine), `components/rite/{squad-header,lock-banner,board,grid,ritual,lab,complete-banner,host-board}.tsx`, `tests/rite.test.ts`.
- Push transport: `worker/rite-room.ts` (Durable Object), `worker/index.ts` (re-exports Vinext's handler plus `RiteRoom`), `app/api/rite/ws/route.ts` (authenticates the upgrade, forwards to the room), Durable Object binding and migration in the Wrangler config. Poll fallback: `app/api/rite/turn/route.ts`. Client: `components/rite/use-turns.ts` (one hook, chooses transport).
- `lib/game/types.ts`: `Game.rite`. `lib/game/engine.ts`: `beginNight` (open/lock, cap the night-choice window), `case 'dawn'` (wait for window, resolve), `execute` (new actions), `tasks()` (reward refresh).
- `lib/game/view.ts`: per-actor `rite` payload and host controls. `app/table/page.tsx`: Rite panels next to the existing Night puzzles.
- No SQL in v1.

## Tests

- Squad planner: sizes 3–4, every seat once, ritual squads of exactly 3, uniform seeded assignment.
- Lock: puzzle commands rejected before `lock.until`, accepted after; night-choice window capped to `lockSeconds`; the lock is view-only (puzzle readable).
- Board: generator par matches `members × rounds × perfectNights`; BFS `dist`; turn machine (timeout, pass, illegal move, move after deadline plus grace, immediate handoff, offline member skipped, key exit skips remaining turns); player never receives order, position or other players' snapshots; both transports produce the same results from the same scripted inputs.
- Grid: for every seed and for vigils of 2, 3 and 4, the true clue set has exactly 3 clues per player (6, 9 or 12) and exactly one solution (solver check); generator is deterministic per seed; no duplicate clues across the vigil; forged clues never appear in a good player's hand; majority rule edges; reveal schedule (clue text absent from the client view until its `revealNight`; nights 2, 3, 4 reveal clues 1, 2, 3); forged clues are marked and visible only to the holding evil member and the host.
- Lab: the generator's optimal solution equals par for vigils of 2, 3 and 4 and the dealt puzzle and every start-of-night state are solvable; pour rule (empty or same top liquid, room, moves the whole top run that fits); turn machine shared with the Board (timeout, pass, illegal pour, grace, immediate handoff, solved skips remaining turns); vote: unanimity needed, missing vote counts as no, the window ends early when all have voted, the timer pauses and the caller's turn ends either way, undo takes back the last pour made tonight and is unavailable with none, reset returns to the original puzzle, no cap on votes; unsolvable detection resets to the start of tonight and consumes the turn; players never receive order, ballots, history or other snapshots; both transports behave the same.
- Ritual: the grimoire has 5 pages with 8/6/3/8/3 entries, 28 distinct 3-symbol sets overall, identical for all members, deterministic per seed; cyclic roles (omens holder `m(k−1)`, keeper `m(k+1)`); every altar has exactly 3 of 5 controls; each ritual's 3 omen sets decode (through the book) to its target; decoy omens decode to legal wrong states; one attempt per night, rejected before `ritualFirstNight` and during the lock; wrong attempt returns failure with no detail, right attempt completes it; the vigil completes at 2 of 3; omens, targets and decoys never reach other seats.
- Completion: the 50% rule (2 squads need 1, 3 need 2, 4 need 2, 5 need 3); reward applied once; Last Light cap; hint dealing to every squad from night 5; idempotent dawn; rewind restores `rite`.
- Views: non-host payloads contain no `forged`, `solution`, `decoyOmens`, `target`, `dist`, `order`, `log`, `ballots` or other squads' completion.

## Open questions

1. **Hosting (blocking):** can the deployment host run a Durable Object with WebSockets and a custom Worker entry? A one-day spike should confirm this before any Board work. If not, the poll fallback gives about 0.3–0.6 s handoff with no new infrastructure.
2. **Board start night:** a night-2 start gives par 16 and, under constant sabotage by one evil player, completes on night 9. Do you want the Board to start on night 2 (current default), or night 3 so the worst case is night 8?
3. **Two-squad tables:** at 6–8 players there are two squads and the 50% rule needs only one of them, so half the table's puzzle can be ignored. Intended?
4. **Last Light:** keep the optional night-8 cap, or remove it so the Rite can run until it is actually completed?
5. **Ritual leeway (new):** with a single holder per omen set, one evil member can still ruin two of the three rituals (their own, and the one whose omens they hold), so "2 of 3" does not stop a determined saboteur. Accept this, or show each omen set to both teammates, or add hint cards that confirm a true target?
6. **Calibration:** only the Board arithmetic is verified. Grid and Ritual pacing need a simulation once the generators exist.
7. **Forged clue count (new):** `gridForgedPerEvil` defaults to 1 extra forged clue per evil member. Is one enough, or should it scale with vigil size?
8. **Ritual pacing (new):** with `ritualFirstNight` = 3 a clean vigil can finish on night 3, earlier than the Rite's night-5 target. Keep 3, or raise it to 4 or 5?
9. **Ritual set uniqueness (new):** I made every omen set unique across the whole book (28 of 56) so unlabeled omens identify their control. Correct?
10. **Lab (settled):** 8 s turns, fewer liquids for smaller vigils, undo limited to tonight's pours, free "never mind" on the vote sheet, voted reset to the original puzzle and automatic reset to the start of tonight. Only the reduced-motion fallback (colour pulse instead of shake) is still an assumption.
