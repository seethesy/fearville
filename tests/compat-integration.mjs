// FEAR-120 version compatibility through the compiled Worker: shells below
// the minimum build get 426 with the update link, below the recommended build
// a hint header; browsers and exempt routes pass; client versions are counted.
// Isolated, ephemeral D1.
import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
const root = path.resolve('dist/server');
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .sort((a, b) => Number(b === 'index.js') - Number(a === 'index.js'));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fearville-compat-'));
const email = 'sybertechlabs@gmail.com';
const worker = new Miniflare({
  name: 'compat-test',
  modules: files.map((f) => ({
    type: 'ESModule',
    path: path.join(root, f),
    contents: fs.readFileSync(path.join(root, f), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'compat-tests' },
  d1Persist: directory,
  durableObjects: { GAME_TABLE: { className: 'GameTable', useSQLite: true } },
  durableObjectsPersist: directory,
  bindings: { ADMIN_EMAIL_ALLOWLIST: email },
});
let db;
const digest = (s) => createHash('sha256').update(s).digest('hex');
const tokens = {};
let requests = 0;
async function fixture(id, role = 'player') {
  const token = randomUUID();
  tokens[id] = token;
  await db
    .prepare(
      'INSERT INTO accounts(id,name,email,handle,created,role,google_email) VALUES (?,?,?,?,0,?,?)',
    )
    .bind(
      id,
      id,
      role === 'admin' ? email : id + '@example.invalid',
      id,
      role,
      role === 'admin' ? email : null,
    )
    .run();
  await db
    .prepare(
      'INSERT INTO account_sessions(hash,account,expires,provider,verified_email,issued) VALUES (?,?,?,?,?,?)',
    )
    .bind(digest(token), id, Date.now() + 3600000, 'google', email, Date.now())
    .run();
}
async function req(route, account, body, cookie, client) {
  const response = await worker.dispatchFetch('http://localhost' + route, {
    headers: {
      ...(client ? { 'X-Fearville-Client': client } : {}),
      'Content-Type': 'application/json',
      'cf-connecting-ip': 'compat-test-' + ++requests,
      ...(account
        ? { 'X-Account-Authorization': 'Bearer ' + tokens[account] }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined
      ? {}
      : { method: 'POST', body: JSON.stringify(body) }),
  });
  const data = await response.json();
  return {
    status: response.status,
    update: response.headers.get('x-fearville-update'),
    updateLink: response.headers.get('x-fearville-update-url'),
    ...data,
  };
}
try {
  await worker.ready;
  db = await worker.getD1Database('DB');
  for (const file of fs
    .readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    let sql = fs
      .readFileSync(path.join('drizzle', file), 'utf8')
      .replace(/--[^\n]*/g, '');
    const triggers = [];
    sql = sql.replace(/CREATE TRIGGER[\s\S]*?END;/gi, (s) => {
      triggers.push(s);
      return '';
    });
    for (const statement of [
      ...sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      ...triggers,
    ])
      await db.prepare(statement).run();
  }
  await fixture('alice');
  await db
    .prepare(
      "INSERT INTO feature_flags(key,environment,value,updated_by,updated_at) VALUES ('builds','local',?, 'test', 0)",
    )
    .bind(
      JSON.stringify({
        ios: {
          minimum: 10,
          recommended: 20,
          updateUrl: 'https://example.invalid/app',
        },
      }),
    )
    .run();
  const old = await req(
    '/api/accounts',
    'alice',
    undefined,
    undefined,
    'ios/1.0/9/1',
  );
  assert.equal(old.status, 426);
  assert.equal(old.updateRequired, true);
  assert.equal(old.updateUrl, 'https://example.invalid/app');
  // Exempt routes still answer so the old shell can learn what to do.
  const flags = await req(
    '/api/flags',
    undefined,
    undefined,
    undefined,
    'ios/1.0/9/1',
  );
  assert.equal(flags.status, 200);
  assert.equal(flags.builds.ios.minimum, 10);
  // The table socket is gated on its query parameter (browsers can't set headers).
  const socket = await worker.dispatchFetch(
    'http://localhost/api/table/socket?code=1&client=' +
      encodeURIComponent('ios/1.0/9/1'),
    { headers: { Upgrade: 'websocket' } },
  );
  assert.equal(socket.status, 426);
  await socket.text();
  const behind = await req(
    '/api/accounts',
    'alice',
    undefined,
    undefined,
    'ios/1.1/15/1',
  );
  assert.equal(behind.status, 200);
  assert.equal(behind.update, 'recommended');
  assert.equal(behind.updateLink, 'https://example.invalid/app');
  const current = await req(
    '/api/accounts',
    'alice',
    undefined,
    undefined,
    'ios/2.0/20/1',
  );
  assert.equal(current.status, 200);
  assert.equal(current.update, null);
  for (const client of ['web/abc', 'android/1/1/1', 'garbage', undefined])
    assert.equal(
      (await req('/api/accounts', 'alice', undefined, undefined, client))
        .status,
      200,
      String(client),
    );
  // Daily counts (waitUntil): poll briefly.
  let rows = [];
  for (let i = 0; i < 20 && rows.length < 3; i++) {
    rows = (await db.prepare('SELECT client,count FROM client_versions').all())
      .results;
    if (rows.length < 3) await new Promise((r) => setTimeout(r, 100));
  }
  const counts = Object.fromEntries(rows.map((r) => [r.client, r.count]));
  assert.equal(counts['ios/1.1/15'], 1);
  assert.equal(counts['ios/2.0/20'], 1);
  assert.equal(counts.web, 1);
  assert.equal(counts['ios/1.0/9'], undefined); // refused before counting
  console.log(
    'Compat integration passed: 426 gate, update hint, exempt routes, socket gate and version counts.',
  );
} finally {
  await worker.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
}
