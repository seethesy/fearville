// Tutorial progress API integration test (FEAR-16). Requires the development
// server (or the local API test server) and the local D1 database with all
// migrations applied, including 0004_tutorial_progress.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
const prefix = 'tutorials-' + randomBytes(4).toString('hex');
const ids = ['a', 'b'].map((x) => prefix + '-' + x);
const tokens = ids.map(() => randomBytes(32).toString('base64url'));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const d1 = (file) =>
  execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--config',
      'wrangler.local.json',
      '--file',
      file,
    ],
    { stdio: 'pipe' },
  );
mkdirSync('work', { recursive: true });
writeFileSync(
  'work/tutorials-fixture.sql',
  `INSERT INTO accounts(id,name,email,created) VALUES ${ids.map((id, i) => `('${id}','Tutorial ${i}','${id}@example.invalid',0)`).join(',')};
INSERT INTO account_sessions(hash,account,expires) VALUES ${ids.map((id, i) => `('${hash(tokens[i])}','${id}',${Date.now() + 600000})`).join(',')};`,
);
d1('work/tutorials-fixture.sql');
const [tA, tB] = tokens;
async function call(account, body) {
  const response = await fetch(base + '/api/tutorials', {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': prefix,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
try {
  // Guests are told to keep progress on the device; nothing is stored.
  let r = await call('');
  assert.deepEqual(r, { status: 200, data: { account: false, seen: [] } });
  r = await call('', {
    action: 'mark',
    id: 'section.rules',
    status: 'skipped',
  });
  assert.equal(r.status, 401);

  // Accounts start empty.
  r = await call(tA);
  assert.deepEqual(r.data, { account: true, seen: [] });

  // Batch from the web, single item from the iPhone.
  r = await call(tA, {
    action: 'mark',
    items: [
      { id: 'walkthrough.lobby', status: 'completed' },
      { id: 'section.flow', status: 'skipped' },
    ],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call(tA, {
    action: 'mark',
    id: 'section.night',
    status: 'skipped',
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.seen, [
    { id: 'section.flow', status: 'skipped' },
    { id: 'section.night', status: 'skipped' },
    { id: 'walkthrough.lobby', status: 'completed' },
  ]);

  // A completion is never downgraded; a skip can be upgraded.
  await call(tA, {
    action: 'mark',
    id: 'walkthrough.lobby',
    status: 'skipped',
  });
  await call(tA, { action: 'mark', id: 'section.flow', status: 'completed' });
  r = await call(tA);
  assert.deepEqual(
    Object.fromEntries(r.data.seen.map((s) => [s.id, s.status])),
    {
      'section.flow': 'completed',
      'section.night': 'skipped',
      'walkthrough.lobby': 'completed',
    },
  );

  // Progress is per account (the same account on any device sees the same).
  r = await call(tB);
  assert.deepEqual(r.data.seen, []);

  // Validation.
  r = await call(tA, { action: 'mark', id: 'nope', status: 'skipped' });
  assert.equal(r.status, 400);
  r = await call(tA, { action: 'mark', id: 'section.flow', status: 'later' });
  assert.equal(r.status, 400);
  r = await call(tA, { action: 'explode' });
  assert.equal(r.status, 400);

  // Reset (account settings) clears everything for that account only.
  await call(tB, { action: 'mark', id: 'section.rules', status: 'completed' });
  r = await call(tA, { action: 'reset' });
  assert.deepEqual(r.data, { account: true, seen: [] });
  r = await call(tB);
  assert.equal(r.data.seen.length, 1);

  console.log('Tutorial progress integration test passed.');
} finally {
  // Account deletion cascades to tutorial progress.
  writeFileSync(
    'work/tutorials-cleanup.sql',
    `DELETE FROM accounts WHERE id IN (${ids.map((id) => `'${id}'`).join(',')});`,
  );
  d1('work/tutorials-cleanup.sql');
}
