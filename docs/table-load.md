# Staging table load test

FEAR-90 adds an on-demand runner; it never targets production or deploys.
Use a dedicated **player-account** session on staging and provide it as
`FEAR_LOAD_ACCOUNT_TOKEN` in the process environment. Admin accounts cannot
create game tables. The manual `Staging table load test` workflow reads the
same named secret from the GitHub staging environment. No credential belongs
in command arguments, source control, reports or logs.

```sh
node --experimental-strip-types scripts/load-table.mjs --url https://staging.fearville.app --tables 5 --players 18
```

Optional `--cycles` (default 3), `--bursts` (default 5) and `--output` control
duration and the JSON result path. Table creation is paced to respect the
30-per-minute entry and five-per-minute creation limits. All tables then play
concurrently, with nineteen authenticated sockets each. Bots claim seats,
deal roles, skip night character tasks, move every available vigil pattern,
send chat bursts, nominate and vote through day/night cycles. The host sends
announcements to all nineteen viewers for fan-out samples. Games are casual;
the runner returns and deletes its own tables after measurement.

Output is one summary table with p50/p95/p99 action RTT and push fan-out,
errors and reconnects. JSON retains individual timings, action categories,
build identity and sanitized failure categories. It excludes roles, private
messages, night choices, puzzle data and credentials. Action RTT is send to
ack. Fan-out is durable commit to the last viewer receiving that version or
a later coalesced version; a three-ping minimum-RTT clock estimate aligns
server and runner clocks. Clock estimates have roughly half a ping RTT of
uncertainty. Setup and cleanup actions are excluded from latency percentiles.

The runner exits unsuccessfully for rejected actions, incomplete scenarios,
cleanup errors or p95 RTT >=150 ms. A run needs fan-out metadata from the
FEAR-90 server build. The staging workflow runs only by manual dispatch and
uploads its JSON for fourteen days. Record the staging run URL, source build,
runner location, RTT percentiles, error/reconnect counts and JSON artifact in
FEAR-90. The five-table/19-seat acceptance result needs a US runner; local CI
validates the scenario but does not assert staging latency.

The CI integration smoke uses a loopback URL and the existing local account
fixture; it runs one table through two cycles, all four Rite patterns, and
cleanup. It cannot mutate staging or production.
