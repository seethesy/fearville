# Live table backend

`GAME_TABLE` binds a SQLite-backed `GameTable` Durable Object in local,
staging and production environments. Its ID is `idFromName(code)`; the first
request initializes it near the Storyteller without a location hint. The
`gametable-v1` Wrangler migration creates the class. No D1 schema change is
needed beyond the existing split storage migration.

The object retains an assembled Game in memory and serializes whole
operations across awaits. Actions persist only changed SQLite parts before
replying. Each part is limited to 1 MB; rewind snapshots use Unicode-safe
chunks of at most 300 KB. HTTP routes authenticate D1 member credentials and
forward commands to the object. The object revalidates membership and account
restrictions before committing. Stale versions only reject dependent edits;
ordinary simultaneous player commands need no conflict retries.

D1 retains a compatibility projection for admin/account transactions, lobby
indexes, recaps and existing social queries. Its core JSON is written only
when changed, and only changed parts are copied. A durable projection intent
and unique write ID recover interrupted commits. Administrative revisions
invalidate the object's cache and reload redacted snapshots, so deletion,
moderation and host transfer remain effective. Results, MVP and ranked locks
remain idempotent D1 operations after object persistence; unfinished result
synchronization is retried before the next operation. Replacing these remaining
compatibility consumers can retire the projection in a later migration.

Explicit lobby deletion clears the object immediately. Mutation activity
refreshes a 30-day retention deadline; an alarm deletes abandoned or ended
tables and their D1 index after that period. Reads do not extend retention.
Finished account records survive table deletion.

`npm run check` covers storage size, Unicode snapshot recovery and operation
serialization. CI's HTTP suites use Miniflare with a SQLite Durable Object
binding and exercise all existing game flows, 18-player load bursts,
simultaneous votes and 19 accepted Rite/chat commands.

Phase timers, night-choice expiry and optional Rite deadlines now use one
alarm scheduled to the earliest pending deadline. GET does not tick or save.
Alarm processing catches up expired phases and turns, commits and schedules
the next deadline; a persisted clock watermark prevents repeatedly waking
for a view-only expiry. Failed D1 synchronization also schedules a retry.

Night Rite remains open through the night with manual turns by default, as
requested for FEAR-86. Storytellers can enable timed mode in setup: the puzzle
window defaults to 90 seconds after the character-task window, board/lab turns
last five seconds and laboratory ballots expire after fifteen seconds.
Sandbox tables remain untimed. Countdown displays use server deadlines and
the measured server clock offset.

The idle HTTP suite verifies advancement with no polling or sockets. Fake
clock tests cover exact deadline boundaries and catch-up. Cloudflare alarm
delivery is at least once; the 250 ms accuracy target needs measurement in
staging and on phones and is not a guaranteed platform delivery SLA.

`GET /api/table/socket?code=…` authenticates the existing seat cookie or bearer
header, checks the origin and code, and upgrades to the table object. It uses
`acceptWebSocket` and serialized viewer attachments, which survive hibernation.
The hello frame contains the source build ID and API version. Every committed
change queues a per-viewer push; hashes exclude version/clock metadata and
suppress unchanged content. Membership, ban and admin restrictions are checked
again before sending. Blocking filters chat before paging and hashing.

Web table state uses `useTableSocket`. Action responses and push frames follow
the same version ordering; fallback polls run at 30 seconds when the socket is
down, with bounded reconnect backoff and a foreground refresh. HTTP actions
remain available as a fallback and for older clients. Live clients send
`{type: 'action', id, command}` and receive `{type: 'ack', id, ok, error?}`.
The latest 100 receipts per seat persist atomically with the game commit;
HTTP `requestId` shares the same receipts, so losing an ack never applies a
retried command twice. Rejections retain their original result too.
Night Rite predicts only the acting player's slides, pours, grid marks and
altar picks. A rejected ack clears the prediction, reveals the latest server
view, flashes red and plays the error cue. Votes and nominations wait for ack.
Escape moves hand off immediately; optional timed turns still expire by alarm.
Night Rite consumes the same pushed game view.
Sandbox shows request round-trip time and the arrival time of the matching
push after send, using a request ID without including credentials in URLs.
Friends, invites and presence polling is unchanged.

Socket frames and the current web client defer archived chat/decision
transcripts; opening a player's recap fetches that game's full detail through
the authenticated table recap endpoint. This prevents past heavy-chat games
from enlarging every routine push. Older native HTTP clients retain their full
recap response; the compact mode and deferred-detail fields are additive.

CI opens nineteen actual Miniflare sockets, checks each payload against its
authorized `view()`, verifies private information and notes stay private, tests
hash suppression for unrelated viewers, and closes a revoked seat's socket.
Fake transports test disconnection, 30-second fallback, backoff, recovery and
stale-frame rejection. Physical phone latency and background-app checks remain
part of the separate playtest tickets.
