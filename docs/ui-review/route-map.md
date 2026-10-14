# UI review route map (FEAR-161)

Every screen, tab, dialog and notable state, who can see it, and how to reach it.
Built from the code on `main` (Oct 2026). Fill one [template](template.md) entry per screen.

## How to get there fast (staging only)

Open **https://staging.fearville.app/staging** in a browser that is **not signed in as the admin account**
(a private window works). The admin account always sees the administration console instead of the app,
so it cannot browse player screens. Production returns "Not found" for this page and `/api/staging`.

- **Sign in as the demo account** → signs the browser in as *QA Demo* (`@stage_qa_demo`): 3 friends,
  1 incoming and 1 outgoing request, 1 blocked player, 1 pending table invitation (to the Lobby fixture),
  3 past games (one unrated, one rated 4★), and a game it told with two ratings received.
- **Open** on a table → resets that fixture table to its named state and seats this browser as its
  Storyteller. Fixtures are Sandbox tables: 12 dummy seats, timers off. Pick a seat in the
  **Storyteller / seat** selector at the top of the table (`SANDBOX · TIMERS DISABLED`) to see that
  player's screen. Opening the same fixture again resets it.

| Fixture | Code | State |
|---|---|---|
| Lobby | `QALOBY` | 12 seats, Rite on with all four patterns, roles unassigned |
| Night 1 · introductions | `QANGTA` | Game started; evil introduction is the active night task |
| Day 1 · Discovery / Discussion / Nominations | `QADISC` / `QADISS` / `QANOMI` | Each day phase |
| Day 1 · Defense / Voting / Execution review | `QADEFN` / `QAVOTE` / `QAREVW` | Nomination made; half the table voted; tally done |
| Night 2 · each Rite pattern | `QARBRD` `QARGRD` `QARRTL` `QARLAB` | Rite open, only that pattern's vigils, window open |
| Game end · Traveler win | `QAENDT` | Good wins; Guardian also wins (ward survived) |
| Session recap | `QARCAP` | Finished game returned to the lobby with its recap |
| Holy Moon and Stars · Night 1 / Discovery | `QAHMSN` / `QAHMSD` | Second script |

Viewer key: **G** guest (no account) · **A** signed-in account · **S** Storyteller · **P** seated player ·
**E** evil player · **X** admin.

## Hub pages

| Screen | Viewers | How to reach | Notable states |
|---|---|---|---|
| Home `/` — hero, "What is Fearville?", rules teaser, script picker | G A | Open the site | Signed out: Join / Host tabs ("There is a seat for you." / "Bring the town together."); Host as guest asks to sign in |
| Home — "Have a code? Join below!" + "A familiar face." + Saved lobbies | A | Sign in (demo account) → Play | Empty saved lobbies; lobby invitation card |
| Join error states | G A | Enter an unknown code / a started game's code / `QALOBY` with 18 seats | "Enter a 6-digit session code.", "This game has started…", "Sandbox sessions do not accept live players." (any `QA…` fixture code) |
| Social `/friends` — handle setup, Add a friend, Invitations, Requests, Friends, Blocked | A | Demo account → Social | No handle yet (new account); empty lists (new account); demo shows every section |
| Remove / block confirm dialogs (AlertDialog) | A | Social → a friend's row → Remove or Block | |
| Report dialog | A | Profile or table → Report | |
| Public profile `/profile?handle=` | A G | Social → tap a friend, or `/profile?handle=stage_qa_player_1` | Friend (stats), non-friend (game count), blocked ("no player has that handle"), unknown handle |
| Rules `/rules` | all | Rules in the nav | Each Night Rite guide (four), glossary popovers |
| Account `/account` — Profile tab (editor, avatar, death effect picker dialog) | A | Account | |
| Account — History tab (`/stats` or `?tab=history`): record, saved lobbies, past games, Storyteller feedback | A | Account → History | Demo has games + feedback; new account is empty |
| History recap dialog | A | History → a past game | Seed games have no stored recap (shows the summary only) |
| Account — Settings (`?tab=settings`): Account & connections, delete account dialog | A | Account → Settings | Delete confirm dialog — **do not confirm on the demo account** |
| Settings dialog (Sound & comfort, Role tips, Privacy & social) | all | Gear icon in the hub header | Signed out hides privacy |
| `/delete-account`, `/privacy`, `/terms` | all | Footer links | |
| Help & tutorials dialog, first-visit section tutorials | all | `?` icon; first visit to each section | Guests see tutorials every visit; accounts once |
| Administration console (console / reports / text / audit) | X | Sign in as the admin account | Replaces every page for X |
| Edit official text dialog | X | Not reachable: X sees only the console. **Unreachable in the current UI** | |
| UI review page `/staging` | all (staging) | Type the URL | Production: "Not found." |

## Table `/table`

Tabs: **Lobby/Game flow**, **Cosmetic** and **Session Recap** (players, lobby only), **Seats/Notes**,
**Messages**, **Session Recap** (Storyteller), **Rules**, **Controls** (Storyteller).

| Screen | Viewers | Fixture / steps | Notable states |
|---|---|---|---|
| Lobby — Game flow (script, role distribution, assign characters, Rite setup: patterns + vigil membership) | S | `QALOBY` | Unassigned roles; setup issues; ranked toggle |
| Lobby — seat list, invite friends panel | S P | `QALOBY` (invite panel needs an account seat; open a real lobby while signed in) | |
| Lobby — Cosmetic tab, Session Recap tab | P | `QALOBY` → pick a seat | Recap empty vs `QARCAP` |
| Membership dialogs (remove player / leave / delete lobby) | S P | Lobby → seat menu, Leave | |
| Night 1 — Storyteller night task list, action dialog | S | `QANGTA` | Each task, skip, dawn disabled while tasks remain |
| Night 1 — team introduction dialog | E | `QANGTA` → pick an evil seat (see Seats tab for roles) | |
| Night choice dialog | P | `QANGTA` → pick a seat whose role has a night choice | Choice window open |
| Sphinx glimpse dialog | P (Sphinx) | `QANGTA` → the Sphinx seat, if dealt (random assignment) | **Depends on random roles**; reassign in `QALOBY` if missing |
| Dawn dialog | all | `QADISC` (opens once per seat) | |
| Day — Discovery, Discussion, Nominations, Defense, Voting, Execution review | all | `QADISC` `QADISS` `QANOMI` `QADEFN` `QAVOTE` `QAREVW` | Vote choices, Storyteller vote panel |
| Character card, role tips, notes, messages | P | any started fixture → pick a seat | Messages empty |
| Night Rite — lock countdown, waiting, your turn, locked snapshot | P | `QARBRD` / `QARLAB` | The fixture's 30-second lock has already ended, so the lock countdown is not shown |
| Night Rite — Sphinx map, clues, forged clues (evil) | P E | `QARGRD` | Locked clue placeholders |
| Night Rite — Ritual altar/omens/grimoire, "The ritual falters" | P | `QARRTL` | Night 2 is before `ritualFirstNight` (3): altars are view-only. Finish the night (Controls → dawn) to reach Night 3 |
| Night Rite — Lab vote sheet, ruined brew | P | `QARLAB` | |
| Night Rite — vigil complete, Rite complete banner | P | Not reached by a fixture: solve a puzzle in `QARGRD` | |
| Night Rite — Storyteller board | S | Any `QAR…` fixture | |
| Rite guides popup (night 1) | P | `QANGTA` → a seat | |
| Game end — recap dialog (winner, duration), player detail dialog, MVP vote, rate Storyteller | all | `QAENDT` | Rating hidden: fixture seats have no linked account |
| Session Recap tab (after return to lobby) | S P | `QARCAP` | |
| Holy Moon and Stars screens | all | `QAHMSN`, `QAHMSD` | |
| Connection banner (offline / reconnecting) | all | Any table → turn off the network | |
| Table settings dialog, keep-awake toggle | all | Gear on the table header | |
| Seat chart zoom, death effect playback | all | Seats tab; a death during Night 2 | |

## Unreachable or hard to reach

- **Edit official text dialog** (`components/ui-text.tsx`): only the admin role can open it, and the admin
  account only sees the administration console.
- **Rite complete / vigil complete banners**: need a solved puzzle; no fixture starts solved.
- **Ritual attempt feedback**: needs Night 3 (`ritualFirstNight`).
- **Ranked tables and Elo changes**: Sandbox tables are never ranked or recorded.
- **Storyteller rating at game end**: needs account-linked seats; review it on a real table played with
  the demo account and another account.
