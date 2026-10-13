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
