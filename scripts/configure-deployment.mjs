import { writeFileSync } from 'node:fs';
import { readConfig } from './wrangler-config.mjs';
const environment = process.env.DEPLOY_ENVIRONMENT;
const sha = process.env.DEPLOY_SHA;
if (
  !['staging', 'production'].includes(environment) ||
  !/^[a-f0-9]{40}$/.test(sha ?? '')
)
  throw Error(
    'A validated deployment environment and full commit SHA are required.',
  );
const config = readConfig('wrangler.jsonc');
config.env[environment].vars = {
  ...config.env[environment].vars,
  BUILD_ID: sha,
  SENTRY_RELEASE: sha,
};
writeFileSync('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n');
console.log(`Configured ${environment} build ${sha}.`);
