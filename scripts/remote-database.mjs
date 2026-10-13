import { readConfig } from './wrangler-config.mjs';
export function deploymentDatabase(
  environment,
  config = readConfig('wrangler.jsonc'),
) {
  if (!['staging', 'production'].includes(environment))
    throw Error('Unknown deployment environment.');
  const selected = config.env?.[environment];
  const id = selected?.d1_databases?.find(
    (binding) => binding.binding === 'DB',
  )?.database_id;
  const other = config.env?.[
    environment === 'staging' ? 'production' : 'staging'
  ]?.d1_databases?.find((binding) => binding.binding === 'DB')?.database_id;
  if (
    !id ||
    id === other ||
    id.startsWith('00000000-') ||
    selected?.vars?.ENVIRONMENT !== environment
  )
    throw Error('Deployment database isolation is not configured.');
  return id;
}
export async function remoteQuery(environment, sql, params = []) {
  const id = deploymentDatabase(environment);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (
    !account ||
    !token ||
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw Error('Run database operations through protected main CI.');
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(id)}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(60000),
    },
  );
  const data = await response.json();
  if (
    !response.ok ||
    !data.success ||
    data.result.some((result) => !result.success)
  )
    throw Error('Deployment database operation failed.');
  return data.result;
}
