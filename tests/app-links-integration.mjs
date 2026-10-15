// FEAR-197: the routed Universal Links association through the compiled
// Worker, per host. Requests carry the production/staging hostnames (no
// network: Miniflare dispatches them straight to the Worker).
import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  APP_IDS,
  ASSOCIATION_PATH,
  associationProblems,
  fetchAssociation,
} from '../scripts/app-links.mjs';
const root = path.resolve('dist/server');
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .sort((a, b) => Number(b === 'index.js') - Number(a === 'index.js'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fearville-links-'));
const worker = new Miniflare({
  name: 'app-links-test',
  modules: files.map((f) => ({
    type: 'ESModule',
    path: path.join(root, f),
    contents: fs.readFileSync(path.join(root, f), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'links-tests' },
  d1Persist: directory,
  durableObjects: { GAME_TABLE: { className: 'GameTable', useSQLite: true } },
  durableObjectsPersist: directory,
});
const fetcher = (url, init) => worker.dispatchFetch(url, init);
try {
  await worker.ready;
  for (const [host, appId] of Object.entries(APP_IDS)) {
    const result = await fetchAssociation(
      fetcher,
      `https://${host}${ASSOCIATION_PATH}`,
    );
    assert.deepEqual(associationProblems(result, appId), [], host);
    // The other environment's app ID would be a failure.
    const other = Object.values(APP_IDS).find((id) => id !== appId);
    assert.ok(associationProblems(result, other).length > 0);
  }
  // Unknown hosts are not associated with any app.
  const unknown = await fetchAssociation(
    fetcher,
    `https://example.invalid${ASSOCIATION_PATH}`,
  );
  assert.equal(unknown.status, 404);
  // The checker itself rejects redirects and wrong types (guards the smoke).
  assert.ok(
    associationProblems(
      {
        status: 301,
        contentType: 'text/html',
        location: 'https://fearville.app/',
        body: '',
      },
      APP_IDS['fearville.app'],
    ).length >= 3,
  );
  // TODO(FEAR-95): GET /.well-known/assetlinks.json per host once Android lands.
  console.log(
    'App links integration passed: association per host, no redirect, JSON, invite paths only.',
  );
} finally {
  await worker.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
}
