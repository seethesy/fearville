# Staging

Staging runs at https://staging.fearville.app with its own Worker, D1 database and `EnvironmentProbe` Durable Object namespace. The probe checks infrastructure reachability; game state remains in D1 until FEAR-85. Runtime settings select the staging OAuth origin, STAGING badge, noindex/robots exclusion, Sentry environment and APNs sandbox host. Production has separate bindings and its approval gate.

Deploy through GitHub Actions (FEAR-107), then run **Seed staging** on main. The seed creates six synthetic accounts, five friendships and three finished games, is safe to repeat, and refuses a production DB binding. It never creates provider identities or sign-in credentials. Sign in with real QA accounts; sample profiles use handles `stage_qa_storyteller` and `stage_qa_player_1` through `stage_qa_player_5`. The admin console can inspect the `staging-fixture-*` account IDs.

Configure sign-in under FEAR-106: Google redirect `https://staging.fearville.app/api/accounts/callback/google`, Apple return URL `https://staging.fearville.app/api/accounts/callback/apple`, and staging-only Worker secrets. The server allowlist is `sybertechlabs@gmail.com`; use that verified Google account for the admin shell. Staging uses a new encryption key, retained across redeploys.

The seed workflow verifies six accounts, five friendships and three finished games in staging, then performs read-only production queries to confirm no `staging-fixture-*` accounts exist there. The staging CI token needs D1 read access to the production database for that verification. It never seeds production. Sentry SDK and push transport integration remain FEAR-110 and FEAR-100/101; environment tags are prepared here for them.
