# Accounts, progression, ranked games, and privacy

The account, Friends, player profile, Statistics, and table pages share a server-authoritative Social API. Existing Google/Apple sign-in and saved-seat recovery continue to identify accounts. Apply `drizzle/0003_new_elektra.sql` to the target D1 database before running this version. The migration was applied to the local development database; production deployment is a separate operation.

## XP and levels

The default reward is 100 XP for a loss, 150 XP for a win, and 300 XP for the Storyteller of a completed game. Both casual and ranked games earn XP. Abandoned lobbies and sandbox games do not. Guest rewards remain associated with their seat and become part of their account when they save that seat.

Each completed game's MVP pool is 100 XP. A player's bonus is their share of all valid votes actually cast, including each of the Storyteller's three votes. Votes for guests remain in the denominator. Fractional shares are retained, so a three-way split does not discard XP. The pool remains unallocated until someone votes. As more votes arrive, existing shares can increase or decrease. Voting on an archived recap updates that same game's bonus rather than awarding it twice.

Accounts begin at level 1. Level 2 requires 500 total XP. Exponential cumulative thresholds are `ceil(500 × (1.15^(level − 1) − 1) / 0.15)`. Thus the first two level requirements are 500 and 575 XP. There is no configured maximum level. The account record shows current progress, total XP, and XP remaining to the next level. These are defaults used while the XP/leveling clarification remains unanswered; progression rules live in `lib/social/progression.ts`.

## Ranked Elo

Accounts begin at 1000 Elo. The Storyteller selects casual or ranked in the lobby; the mode cannot change during play. Everyone, including the Storyteller, must save their seat to a different account for ranked play. Ranked games require both alignments. The Storyteller earns XP without a player Elo change.

At game start, each player's own rating is compared with the average starting rating of the opposing team. Teammates and the Storyteller are excluded from the opponent average. Teammate statistics exclude the player themselves. Guests in casual games contribute a starting rating of 1000 to lobby averages.

The confirmed expectation is `1 / (1 + 10^((opponent average − player rating) / 2500))`. K is 750 below 2000, 650 from 2000, 550 from 4000, 450 from 6000, and 350 from 8000 onward. The first 10 completed ranked games use the hidden 1.7 multiplier; games 11–25 use 1.3; subsequent games use 1. The resulting win/loss changes are rounded to the nearest integer and saved at game start. The UI shows only the player's starting Elo and potential gain/loss. It does not receive calibration fields or other participants' account/rating snapshots.

A unique account reservation, committed atomically with starting the game, prevents overlapping ranked games from using the same rating or calibration position. Reservations remain until the result is durably recorded. Starting ratings and potential changes remain fixed when the Storyteller makes role changes. Final character/alignment determines the recorded outcome. There is no added Elo floor.

## Records and statistics

Statistics are aggregated from durable per-game records, rather than separate mutable totals. They include games, wins, losses, win percentages, good/evil and ranked records, script → role type → character breakdowns, average opponent and teammate Elo, current/peak Elo, MVP votes and bonus XP, current/best win streaks, survival percentage, average game duration, and Storyteller feedback. Character credit uses the final actual role, including promotions and hidden roles.

History includes script, mode, date, duration, player count, final character, outcome, XP, MVP votes, Elo change, and starting lobby averages. Older games are available in pages of 20. Existing records retain their original wins/losses and character credit; unavailable legacy script/starting ratings are explicitly shown as unavailable, and past games are not retroactively assigned XP or ranked changes by the migration.

Rematches use distinct game-start identifiers. Guest seats can be linked after a rematch without losing prior records. Repeated polls and requests upsert the same result. Session-version guards stop stale requests from restoring withdrawn results or overwriting newer votes. Rewinding a completed game removes its XP, Elo, statistics, and ratings; ending it again records the corrected result. Later matches retain their originally frozen potential changes. Archived MVP updates are reconciled on subsequent polls after a transient persistence failure.

## Friends and visibility

Users can request, accept, decline/cancel, remove, block/unblock, open profiles, and invite accepted friends to their lobby. Simultaneous mutual requests yield one accepted friendship. Invitations require current friendship, membership of the sending table, lobby capacity, and recipient preferences. Accepting an invitation atomically creates the seat, saves it to the account, and consumes the invite, preventing concurrent double acceptance. Removing a friend or blocking withdraws pending invitations in both directions. Disabling invitations withdraws invitations waiting for that recipient.

The Account page offers separate Public / Friends / Private settings for statistics (including level, Elo, and Storyteller averages) and match history. Public means any signed-in player. New accounts default to Friends for both. Requests can be enabled for everyone or disabled; invitations can be enabled for friends or disabled. API checks enforce these choices for profiles and direct paginated-history requests. Private statistics do not leak through a public games-played summary. Blocks override public visibility in both directions. Storyteller feedback comments remain visible only to their recipient.

## Validation

`tests/progression.test.ts` checks formulas, all tier/calibration boundaries, opposing-team averages, fractional MVP rewards, exponential thresholds, privacy, and snapshot redaction. `tests/progression-integration.mjs` exercises the actual local D1/API flow, including eligibility, ranked reservations and rollback, rewards, rewind withdrawal, archived votes/recovery, script rematches, casual Elo, profile/history privacy, concurrent friendship requests and invitation acceptance, and invitation withdrawal. The existing social suite also covers account linking, invites, feedback, rewind, and deletion.
