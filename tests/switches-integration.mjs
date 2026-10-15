// FEAR-122 remote switches through the compiled Worker: admin-only edits,
// kill confirmation, audit entries, the public subset, and server-side
// enforcement (paused new games, guest play, switched-off Rite puzzles).
// Isolated, ephemeral D1; fixtures are inserted directly.
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fearville-switch-'));
const email = 'sybertechlabs@gmail.com';
const worker = new Miniflare({
  name: 'switches-test',
  modules: files.map((f) => ({
    type: 'ESModule',
    path: path.join(root, f),
    contents: fs.readFileSync(path.join(root, f), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'switch-tests' },
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
async function req(route, account, body, cookie) {
  const response = await worker.dispatchFetch('http://localhost' + route, {
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': 'switch-test-' + ++requests,
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
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    ...data,
  };
}
const flip = (key, value, extra = {}) =>
  req('/api/admin', 'admin', { action: 'switch', key, value, ...extra });
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
  await fixture('admin', 'admin');
  await fixture('alice');

  // Defaults: everything on, no banner.
  assert.deepEqual(
    (({ maintenance, off, builds }) => ({ maintenance, off, builds }))(
      await req('/api/flags'),
    ),
    { maintenance: null, off: [], builds: {} },
  );
  // Only the admin can read or edit switches.
  assert.equal((await req('/api/admin?view=switches', 'alice')).status, 403);
  assert.equal((await flip('guests', 'off', {})).status, 200);
  assert.equal(
    (await req('/api/admin', 'alice', { action: 'switch', key: 'guests', value: 'on' }))
      .status,
    403,
  );
  const overview = await req('/api/admin?view=switches', 'admin');
  assert.equal(overview.status, 200);
  assert.deepEqual(
    overview.environments.map((e) => e.name),
    ['local'],
  );
  assert.ok(overview.catalog.some((s) => s.key === 'rite.board'));
  assert.equal(overview.environments[0].flags.switches.guests, 'off');
  // Validation: unknown keys, kill on a non-killable switch, other environments.
  assert.equal((await flip('nope', 'off')).status, 400);
  assert.equal((await flip('signups', 'kill')).status, 400);
  assert.equal(
    (await flip('guests', 'on', { environment: 'production' })).status,
    400,
  );

  // Guest play off: an anonymous device can't join; a signed-in player can.
  const lobby = await req('/api/session', 'alice', {
    action: 'create',
    name: 'Alice',
  });
  assert.equal(lobby.status, 200, JSON.stringify(lobby));
  const guest = await req('/api/session', undefined, {
    action: 'join',
    code: lobby.code,
    name: 'Guest',
  });
  assert.equal(guest.status, 400);
  assert.match(guest.error, /Guest play is paused/);
  assert.equal((await flip('guests', 'on')).status, 200);
  assert.equal(
    (
      await req('/api/session', undefined, {
        action: 'join',
        code: lobby.code,
        name: 'Guest',
      })
    ).status,
    200,
  );

  // A switched-off Rite puzzle is refused by the table, whatever the client sends.
  assert.equal((await flip('rite.lab', 'off')).status, 200);
  assert.ok((await req('/api/flags')).off.includes('rite.lab'));
  const game = await req('/api/game', undefined, undefined, lobby.cookie);
  assert.equal(game.status, 200, JSON.stringify(game));
  const configure = await req(
    '/api/rite',
    undefined,
    {
      action: 'configureRite',
      version: game.version,
      config: {
        enabled: true,
        patterns: ['board', 'grid', 'ritual', 'lab'],
        opensNight: 2,
        threshold: 0.5,
        lockSeconds: 30,
        windowSeconds: 90,
        ritualFirstNight: 3,
        forgedPerEvil: 1,
        notifyCompletion: true,
      },
    },
    lobby.cookie,
  );
  assert.ok(configure.status >= 400, JSON.stringify(configure));
  assert.match(configure.error, /unavailable/);

  // Kill needs a confirmation token bound to this admin session.
  const preview = await flip('rite', 'kill');
  assert.equal(preview.status, 200);
  assert.equal(preview.confirmationRequired, true);
  assert.ok(!(await req('/api/flags')).off.includes('rite'));
  assert.equal(
    (await flip('rite', 'kill', { confirmation: 'forged' })).status,
    400,
  );
  assert.equal(
    (await flip('rite', 'kill', { confirmation: preview.confirmation }))
      .status,
    200,
  );
  assert.ok((await req('/api/flags')).off.includes('rite'));

  // Maintenance banner with paused new games.
  assert.equal(
    (
      await flip('maintenance', {
        text: 'Upgrading tonight',
        severity: 'warning',
        newGamesDisabled: true,
      })
    ).status,
    200,
  );
  const banner = await req('/api/flags');
  assert.equal(banner.maintenance.text, 'Upgrading tonight');
  const paused = await req('/api/session', 'alice', {
    action: 'create',
    name: 'Alice',
  });
  assert.equal(paused.status, 400);
  assert.match(paused.error, /paused for maintenance/);
  assert.equal((await flip('maintenance', null)).status, 200);
  assert.equal((await req('/api/flags')).maintenance, null);

  // Builds (used by version compatibility).
  assert.equal(
    (await flip('builds', { ios: { minimum: 3, recommended: 5 } })).status,
    200,
  );
  assert.equal((await req('/api/flags')).builds.ios.recommended, 5);

  // Every change, refusal and confirmation is in the audit log.
  const audit = (
    await db
      .prepare(
        "SELECT action,target,result FROM admin_audit WHERE action LIKE 'switch%' ORDER BY at",
      )
      .all()
  ).results;
  assert.ok(audit.some((a) => a.target === 'local:guests' && a.result === 'success'));
  assert.ok(audit.some((a) => a.action === 'switch kill' && a.result === 'confirmation required'));
  assert.ok(audit.some((a) => a.action === 'switch kill' && a.result === 'success'));
  assert.ok(audit.some((a) => a.target === 'local:signups' && a.result === 'error'));
  assert.ok(audit.some((a) => a.target === 'local:maintenance'));
  console.log(
    'Switches integration passed: admin-only edits, kill confirmation, audit, banner, guests, paused games and Rite enforcement.',
  );
} finally {
  await worker.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
}
