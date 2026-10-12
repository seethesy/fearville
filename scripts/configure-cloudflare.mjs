// Read-only discovery; CI supplies Cloudflare credentials. Never creates or deploys.
import { writeFileSync } from 'node:fs';
import { readConfig } from './wrangler-config.mjs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token)
  throw new Error(
    'CI must supply CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
  );
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database?per_page=100`,
  {
    headers: { Authorization: `Bearer ${token}` },
  },
);
const data = await response.json();
if (!response.ok || !data.success)
  throw new Error(
    'Cloudflare database discovery failed. Check CI token permissions.',
  );
const config = readConfig();
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
config.account_id = account;
writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log(`Resolved ${names.join(' and ')} DB bindings.`);
