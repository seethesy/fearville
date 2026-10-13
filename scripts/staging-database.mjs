import { readConfig } from './wrangler-config.mjs';
export function stagingDatabase(config = readConfig('wrangler.jsonc')) {
  const staging = config.env?.staging;
  const production = config.env?.production;
  const id = staging?.d1_databases?.find((binding) => binding.binding === 'DB')?.database_id;
  const productionId = production?.d1_databases?.find((binding) => binding.binding === 'DB')?.database_id;
  if (staging?.vars?.ENVIRONMENT !== 'staging' || staging?.vars?.APP_ORIGIN !== 'https://staging.fearville.app' || !id || id === productionId || id.startsWith('00000000-')) throw Error('Staging database isolation is not configured.');
  return id;
}
export async function stagingQuery(sql, params = [], config) {
  const id = stagingDatabase(config);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw Error('Cloudflare CI credentials are required.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(id)}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok || !data.success || data.result.some((result) => !result.success)) throw Error('Staging D1 operation failed; inspect the CI credentials and schema.');
  return data.result;
}
