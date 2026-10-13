import { stagingQuery } from './staging-database.mjs';
import { remoteQuery } from './remote-database.mjs';

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main'
)
  throw Error('Run staging isolation verification through protected main CI.');

async function count(query, sql) {
  const result = await query(sql);
  const value = result[0]?.results?.[0]?.count;
  if (!Number.isInteger(value))
    throw Error('Isolation check returned an invalid count.');
  return value;
}

const accounts = await count(
  stagingQuery,
  "SELECT COUNT(*) AS count FROM accounts WHERE id LIKE 'staging-fixture-%'",
);
const friends = await count(
  stagingQuery,
  "SELECT COUNT(*) AS count FROM friendships WHERE requester='staging-fixture-host'",
);
const games = await count(
  stagingQuery,
  "SELECT COUNT(*) AS count FROM games WHERE id LIKE 'staging-fixture-game-%'",
);
if (accounts !== 6 || friends !== 5 || games !== 3)
  throw Error('Staging fixtures do not match the expected seed counts.');

// Production access is read-only and exposes counts only. An uninitialized
// production database has no accounts table and therefore no fixture accounts.
const productionRead = (sql) => remoteQuery('production', sql);
const tables = await count(
  productionRead,
  "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='accounts'",
);
const productionFixtures =
  tables === 0
    ? 0
    : await count(
        productionRead,
        "SELECT COUNT(*) AS count FROM accounts WHERE id LIKE 'staging-fixture-%'",
      );
if (productionFixtures !== 0)
  throw Error('Staging fixture accounts were found in production.');
console.log(
  `PASS: staging has ${accounts} fixture accounts, ${friends} friendships and ${games} finished games; production has no fixture accounts.`,
);
