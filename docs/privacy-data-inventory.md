# Privacy data inventory

Source for Apple's **App Privacy** questionnaire, Google Play's **Data safety**
form and the in-app privacy page (`app/privacy/page.tsx`). Update this file in
the same PR as any change that collects, shares or retains new data.

No advertising, no tracking across apps or websites, no data sold, no data
shared with third parties for their own purposes. Data is processed by the
hosting provider (Cloudflare Workers + D1) on Fearville's behalf.

## Collected today

| Data | Where (table / field) | Purpose | Linked to user | Store category (Apple / Google) | Retention | On account deletion |
|---|---|---|---|---|---|---|
| Email address (from Google/Apple; may be an Apple relay address) | `accounts.email` | Account recovery, admin allowlist | Yes (account) | Contact info: Email / Personal info: Email | While the account exists | Deleted |
| Display name from provider | `accounts.name` | Default name | Yes | Contact info: Name / Personal info: Name | While the account exists | Deleted |
| Provider user ID (Google/Apple subject) | `identities.id` | Sign-in | Yes | Identifiers: User ID / Personal info: User IDs | While the account exists | Deleted |
| Apple refresh token (encrypted) | `identities.refresh_token` | Revoke Sign in with Apple on deletion | Yes | Not displayed | While the account exists | Revoked with Apple, then deleted |
| Handle | `accounts.handle` | Friend search | Yes | Identifiers: User ID / Personal info: User IDs | While the account exists | Deleted |
| Profile: lobby name, avatar choice or uploaded photo (small JPEG), death animation, settings | `account_profiles` | Profile and table appearance | Yes | User content: Photos / Photos and videos: Photos | While the account exists | Deleted |
| Presence (last seen, online visibility) | `account_profiles.last_seen`, `online_visible` | Friends' online status | Yes | Usage data: Product interaction / App activity | Overwritten on each visit; shown online for 90 s | Deleted |
| Privacy settings | `account_settings` | Who can see stats/history, send requests and invites | Yes | Not a collected-data category (app functionality setting) | While the account exists | Deleted |
| Friends, requests, blocks | `friendships` | Social features | Yes | Other user content / App activity: Other user-generated content | While the account exists | Deleted |
| Table invitations | `session_invites` | Invite friends to a table | Yes | Other user content | 24 hours | Deleted |
| Game records: seat name, character, team, result, XP, Elo, MVP votes | `games`, `game_players` | Stats, progression, recaps | Yes, while linked | Gameplay content / App activity: Other actions | Indefinite (other players' history) | Seat becomes "Former player", account link removed |
| Session recaps (seat names, roles, decisions, revealed notes and chat) | `games.recap`, `sessions.state.recaps` | Post-game recap for participants | Yes, while linked | Other user content / Messages: Other in-app messages | Indefinite | Name, photo, notes and messages removed |
| Storyteller ratings given: stars and optional comment | `storyteller_ratings` | Storyteller feedback | Yes | Other user content | 14-day edit window, then kept | Stars kept anonymously, comment deleted |
| Storyteller ratings received | `storyteller_ratings` | Storyteller stats | Yes | Other user content | While the account exists | Deleted |
| Live table state: seat name, role, votes, night choices, private notes, chat | `sessions.state`, `session_parts`, `session_snapshots` | Run the game | Linked via saved seat while signed in | Gameplay content; Messages: Other in-app messages | Until the table is closed | Hosted tables deleted; player seats renamed "Former player", photos, notes and messages removed, including rewind snapshots |
| Player reports: reason, optional note, reporter/target links, handle or message snapshot, resolution | `player_reports` | Moderate abuse | Yes while account/seat links exist | Other user content | Retained for moderation | Reporter links and notes removed; reports about the account lose name, content snapshot and resolution text; anonymous metadata retained |
| Seat credentials (hashed) | `members.token_hash`, `account_seats` | Rejoin a seat | Yes | Identifiers: Device or other IDs | 30 days | Deleted |
| Sign-in sessions (hashed) | `account_sessions` | Stay signed in | Yes | Identifiers | 30 days | Deleted |
| Tutorial progress | `tutorial_progress` | Show each tutorial once | Yes | Usage data: Product interaction | While the account exists | Deleted |
| Admin XP adjustments and granted items | `admin_progression`, `account_items` | Administrative progression and ownership | Yes | Gameplay content | While the account exists | Deleted by cascade |
| Administrative audit metadata, decisions and reasons | `admin_audit` | Hold administrative actions accountable | Restricted; account targets are one-way references | Other user content | Retained, append-only | Direct player names/emails and hidden game fields are not copied into the log; operational metadata and moderator reasons remain |
| Published UI text and its versions | `ui_text_versions` | Live official text and rollback | Editor's admin ID | Other user content | Retained, append-only | Official published text remains |
| IP address (hashed with action and minute) | `rate_limits.key` | Abuse prevention | No | Not stored in a linkable form | About 2 minutes | n/a |

Guests: a random seat credential (hashed) plus whatever they type at the table
(name, notes, chat). Nothing is linked to an identity, and it expires with the seat.

## Planned (update this file when each ships)

| Data | Ticket | Notes for the store forms |
|---|---|---|
| Crash and error data (Sentry): stack traces, app version, platform, table code, phase. Never tokens, chat, notes or role info | FEAR-110 | Diagnostics: Crash data, Performance data. Linked: no (no user ID sent) |
| Problem reports with optional screenshot and contact email | FEAR-111 | User content: Customer support; Contact info: Email (optional) |
| Push device tokens (APNs/FCM) | FEAR-100 | Identifiers: Device ID. Deleted with the account |
| Purchase records (trust ledger, Stripe/Apple/Google receipts) | FEAR-44/75/76 | Purchases: Purchase history. Keep only what refunds and tax require, unlinked from personal data on deletion (FEAR-77) |

## Deletion

- In-app: **Account → Settings → Delete account** on web and in the apps (type DELETE).
- Web: https://fearville.app/delete-account (the URL for Google Play's account-deletion field).
- Code: `lib/accounts/deletion.ts`. Test: `tests/account-deletion-integration.mjs`.
