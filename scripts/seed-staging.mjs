import { seedStatements } from '../lib/staging/seed.ts';
import { stagingQuery } from './staging-database.mjs';
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main'
)
  throw Error('Run the protected Seed staging workflow on main.');
await stagingQuery(seedStatements(Date.now()).join('\n'));
console.log(
  'Seeded staging: six synthetic accounts, five friendships and three finished games. No sign-in credentials were created.',
);
