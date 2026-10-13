# Tutorials, guides and tips: QA (FEAR-30)

Automated coverage for the FEAR-15 epic, plus the manual checklist that its
acceptance criteria require at 400px and on desktop.

## Automated

| Area | Where |
| --- | --- |
| Engine: start, next/back, skip, queueing, covers, replay, persistence | `tests/tutorials.test.ts` |
| Real games through `view()`: who is offered what (walkthrough, Storyteller tour, host sections, Night 1 guide per pattern), Help per viewer | `tests/tutorials-qa.test.ts` |
| Skip at every step of every tutorial (web and iPhone); replay of every Help entry | `tests/tutorials-qa.test.ts` |
| Guest versus account: once per account on any device, again on every guest join | `tests/tutorials-qa.test.ts`, `tests/tutorials-integration.mjs` |
| Suppression with real state: Rite turns (Escape, Laboratory), open night choices; queued popups appear afterwards in order | `tests/tutorials-qa.test.ts` |
| Leaks in the view model: other players' characters, other vigils' patterns, other roles' tips, evil-team tips; Drunk and Dazed get their believed role's tips; only the Sphinx gets a glimpse | `tests/tutorials-qa.test.ts` |
| Leaks over HTTP: `/api/game`, `/api/rite`, `/api/tutorials` for every seat on nights 1 and 2 | `tests/tutorials-qa-integration.mjs` |
| Role tips: list on Game Flow, toggle in Help and Settings, account preference | `tests/tutorials-qa.test.ts`, `tests/accounts-integration.mjs` |
| Overlay accessibility contract (modal, labels, focus trap, Escape, reduced motion) and 400px card sizing | `tests/tutorials-qa.test.ts` |
| Regression: vigils fixed at game start; Rite opens on night 2 with those vigils and carries puzzles into night 3 | `tests/tutorials-qa.test.ts` |

The 30-second night lock no longer exists (the Rite opens straight into
untimed turns). The tests assert that no lock ever reaches a player, and that
suppression would still hold popups if one returned.

## Manual checklist

Run each item twice: at **400px** wide (browser devtools, a phone-sized
window) and at **desktop** width (1280px or wider). Use one guest and one
signed-in account. Tick both columns.

### Keyboard and focus

| Check | 400px | Desktop |
| --- | --- | --- |
| The first tutorial card takes focus on its primary button. | ☐ | ☐ |
| Tab and Shift+Tab stay inside the card. | ☐ | ☐ |
| Enter or Space activates Next / Back / Skip. | ☐ | ☐ |
| Escape asks "Skip?"; Escape again returns to the step. | ☐ | ☐ |
| When a tutorial ends, focus returns to where it was. | ☐ | ☐ |
| Help opens from the keyboard and every Replay / Start button is reachable. | ☐ | ☐ |
| The role tips list expands and collapses from the keyboard. | ☐ | ☐ |

### Screen reader (VoiceOver or NVDA)

| Check | 400px | Desktop |
| --- | --- | --- |
| The card is announced as a dialog with its step title. | ☐ | ☐ |
| Moving to the next step announces the new title and text. | ☐ | ☐ |
| Help buttons read "Start …" or "Replay …" with the tutorial name. | ☐ | ☐ |
| The tips toggle reads "Show role tips" with its state. | ☐ | ☐ |

### Reduced motion (OS setting on)

| Check | 400px | Desktop |
| --- | --- | --- |
| Cards appear without animation; the spotlight does not slide. | ☐ | ☐ |
| Spotlighted targets jump into view rather than smooth-scrolling. | ☐ | ☐ |

### Layout

| Check | 400px | Desktop |
| --- | --- | --- |
| The card never overflows the screen; long steps scroll inside it. | ☐ | ☐ |
| The card does not cover the spotlighted element. | ☐ | ☐ |
| Night Rite guide diagrams fit and stay legible. | ☐ | ☐ |
| Storyteller tour: steps that switch tabs (Seats, Controls, Flow) open the right tab and spotlight the right panel. | ☐ | ☐ |
| The "starts when this timed step ends" notice fits above the bottom bar. | ☐ | ☐ |

### Behaviour spot checks

| Check | 400px | Desktop |
| --- | --- | --- |
| Guest player: walkthrough on join; again after leaving and rejoining. | ☐ | ☐ |
| Account player: walkthrough once; not again on a second device. | ☐ | ☐ |
| Storyteller: tour on first hosting; players at the same table never see it. | ☐ | ☐ |
| Night 1: each player sees only their own vigil's guide. | ☐ | ☐ |
| During a Rite turn or an open night choice, no popup appears; it shows afterwards. | ☐ | ☐ |
| Turning tips off hides the list; turning them on restores it. | ☐ | ☐ |
