// Serve the compiled API worker directly, avoiding Wrangler's development
// proxy restarts on Windows. Miniflare is supplied by the locked Wrangler tree.
// Run `npm run build` first. Uses only the project's local D1 database.
// PORT overrides the default 3001 (used by scripts/run-integration.mjs).
import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist/server');
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((file) => file.endsWith('.js'));
files.sort((a, b) => Number(b === 'index.js') - Number(a === 'index.js'));
const worker = new Miniflare({
  name: 'fearville-api-validation',
  modules: files.map((file) => ({
    type: 'ESModule',
    path: path.join(root, file),
    contents: fs.readFileSync(path.join(root, file), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: '00000000-0000-4000-8000-000000000000' },
  d1Persist: path.join(process.env.CT_D1_PERSIST || '.wrangler/state', 'v3/d1'),
  durableObjects: { GAME_TABLE: { className: 'GameTable', useSQLite: true } },
  durableObjectsPersist: path.join(
    process.env.CT_D1_PERSIST || '.wrangler/state',
    'v3/do',
  ),
  port: Number(process.env.PORT) || 3001,
});
console.log('Local production API worker:', String(await worker.ready));
const shutdown = async () => {
  await worker.dispose();
  process.exit();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('message', (message) => {
  if (message === 'shutdown') void shutdown();
});
process.on('disconnect', shutdown);
