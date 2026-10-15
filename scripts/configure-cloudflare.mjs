// Read-only discovery; CI supplies Cloudflare credentials. Never creates or deploys.
import { mkdirSync, writeFileSync } from 'node:fs';
import { readConfig } from './wrangler-config.mjs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!account || !token)
  throw new Error(
    'CI must supply CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
  );
if (!/^[a-f0-9]{32}$/i.test(account))
  throw new Error(
    'CLOUDFLARE_ACCOUNT_ID must be the 32-character Cloudflare Account ID, not a zone ID, account name or URL.',
  );
if (/^Bearer\s/i.test(token))
  throw new Error(
    'CLOUDFLARE_API_TOKEN must contain only the token value, without a Bearer prefix.',
  );
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database?per_page=100`,
  {
    headers: { Authorization: `Bearer ${token}` },
  },
);
const data = await response.json();
if (!response.ok || !data.success) {
  // Both user-owned and account-owned tokens exist. Report only status and
  // HTTP codes; never print token IDs, account IDs or complete API responses.
  const checks = await Promise.allSettled(
    [
      ['User token', 'user/tokens/verify'],
      [
        'Account token',
        `accounts/${encodeURIComponent(account)}/tokens/verify`,
      ],
    ].map(async ([label, endpoint]) => {
      const check = await fetch(
        `https://api.cloudflare.com/client/v4/${endpoint}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      const result = await check.json();
      return `${label} verification: HTTP ${check.status}, active=${result.success === true && result.result?.status === 'active'}`;
    }),
  );
  for (const check of checks)
    console.log(
      check.status === 'fulfilled'
        ? check.value
        : 'Token verification unavailable.',
    );
  throw new Error(
    `Cloudflare database discovery failed (HTTP ${response.status}; error codes ${(data.errors || []).map((error) => error.code).join(',')}). Check the environment's Account ID and D1 token permissions.`,
  );
}
const config = readConfig();
console.log(
  `Available D1 database names: ${JSON.stringify(data.result.map((database) => database.name))}`,
);
const names = process.argv[2] ? [process.argv[2]] : ['staging', 'production'];
if (names.some((name) => !['staging', 'production'].includes(name)))
  throw new Error('Expected staging or production.');
for (const name of names) {
  const binding = config.env[name].d1_databases[0];
  const override =
    process.env[`D1_${name.toUpperCase()}_DATABASE_NAME`] ||
    binding.database_name;
  const matches = data.result.filter((database) => database.name === override);
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${override} database. Provision it in Cloudflare first (FEAR-105); this script is read-only.`,
    );
  binding.database_name = matches[0].name;
  binding.database_id = matches[0].uuid;
}
// FEAR-122: production's STAGING_DB (remote switches only) mirrors staging's DB.
const stagingBinding = config.env.staging.d1_databases[0];
for (const binding of config.env.production.d1_databases)
  if (binding.binding === 'STAGING_DB') {
    binding.database_name = stagingBinding.database_name;
    binding.database_id = stagingBinding.database_id;
  }
config.account_id = account;
writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
// Only public binding metadata is exported. Never include credentials or the
// account ID supplied through GitHub secrets.
const bindings = {};
for (const name of ['staging', 'production']) {
  const databaseName =
    process.env[`D1_${name.toUpperCase()}_DATABASE_NAME`] ||
    config.env[name].d1_databases[0].database_name;
  const database = data.result.find((item) => item.name === databaseName);
  if (database)
    bindings[name] = {
      database_name: database.name,
      database_id: database.uuid,
    };
}
mkdirSync('work', { recursive: true });
writeFileSync(
  'work/d1-bindings.json',
  JSON.stringify(bindings, null, 2) + '\n',
);
console.log(`Resolved ${names.join(' and ')} DB bindings.`);
