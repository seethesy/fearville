// FEAR-121 deploy during a live game: start a Holy Moon and Stars game, then
// "deploy" (restart the runtime with a bumped BUILD_ID, which restarts the
// GameTable object from storage) and check every player's state is intact,
// sockets reconnect and see the new build, and stored state is versioned.
// Isolated, ephemeral D1 and Durable Object storage.
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fearville-deploy-'));
const email = 'sybertechlabs@gmail.com';
const options = {
  name: 'deploy-test',
  modules: files.map((f) => ({
    type: 'ESModule',
    path: path.join(root, f),
    contents: fs.readFileSync(path.join(root, f), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'deploy-tests' },
  d1Persist: directory,
  durableObjects: { GAME_TABLE: { className: 'GameTable', useSQLite: true } },
  durableObjectsPersist: directory,
  bindings: { ADMIN_EMAIL_ALLOWLIST: email, BUILD_ID: 'build-1' },
};
const worker = new Miniflare(options);
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
async function req(route, { account, token, body } = {}) {
  const response = await worker.dispatchFetch('http://localhost' + route, {
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': 'deploy-test-' + ++requests,
      ...(account
        ? { 'X-Account-Authorization': 'Bearer ' + tokens[account] }
        : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined
      ? {}
      : { method: 'POST', body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, route + ' ' + JSON.stringify(data));
  return { build: response.headers.get('x-fearville-build'), ...data };
}
async function hello(token, code) {
  const response = await worker.dispatchFetch(
    'http://localhost/api/table/socket?code=' + code,
    {
      headers: {
        Upgrade: 'websocket',
        Authorization: 'Bearer ' + token,
        'cf-connecting-ip': 'deploy-test-' + ++requests,
      },
    },
  );
  assert.equal(response.status, 101);
  const socket = response.webSocket;
  const frames = [];
  const got = new Promise((resolve) =>
    socket.addEventListener('message', (e) => {
      frames.push(JSON.parse(e.data));
      if (frames.length === 2) resolve(frames);
    }),
  );
  socket.accept();
  const result = await Promise.race([
    got,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('no hello/view frames')), 10000),
    ),
  ]);
  socket.close();
  return result;
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
  await fixture('host');
  const created = await req('/api/session', {
    account: 'host',
    body: { action: 'create', name: 'Deploy Host' },
  });
  const host = created.token,
    code = created.code;
  const tokens8 = [];
  for (let i = 0; i < 8; i++)
    tokens8.push(
      (
        await req('/api/session', {
          body: { action: 'join', code, name: 'Star ' + (i + 1) },
        })
      ).token,
    );
  for (const [i, token] of tokens8.entries())
    await req('/api/game', {
      token,
      body: { action: 'claimSeat', seat: i + 1 },
    });
  let state;
  const act = async (payload) => {
    state = await req('/api/game', { token: host });
    state = (
      await req('/api/game', {
        token: host,
        body: { ...payload, version: state.version },
      })
    ).game;
  };
  await act({ action: 'setScript', script: 'holyMoonStars' });
  const roles = [
    'constellation',
    'astrologist',
    'mystic',
    'medium',
    'diviner',
    'insomniac',
    'nightmare',
    'miasma',
  ];
  const seats = state.players.slice().sort((a, b) => a.seat - b.seat);
  for (let i = 0; i < 8; i++)
    await act({
      action: 'edit',
      player: seats[i].id,
      name: seats[i].name,
      seat: seats[i].seat,
      role: roles[i],
      alive: true,
      ghost: true,
    });
  await act({
    action: 'configure',
    nightChoice: 5,
    discovery: 5,
    discussion: 5,
    nomination: 30,
    defense: 5,
    voting: 5,
    bluff1: 'stargazer',
    bluff2: 'spirit',
    bluff3: 'priest',
  });
  await act({ action: 'start' });
  assert.notEqual(state.phase, 'lobby');

  const snapshot = async () => {
    const views = [];
    for (const token of [host, ...tokens8]) {
      const v = await req('/api/game', { token });
      views.push(v);
    }
    return views;
  };
  const essentials = (v) => ({
    me: v.me,
    phase: v.phase,
    day: v.day,
    night: v.night,
    version: v.version,
    character: v.character?.name ?? null,
    players: v.players.map((p) => [p.id, p.name, p.seat, p.alive]),
  });
  const before = await snapshot();
  assert.ok(before.every((v) => v.build === 'build-1'));
  const [helloBefore] = await hello(tokens8[0], code);
  assert.equal(helloBefore.buildId, 'build-1');
  assert.equal(helloBefore.apiVersion, 1);
  const stored = await db
    .prepare('SELECT state FROM sessions WHERE code=?')
    .bind(code)
    .first();
  assert.equal(JSON.parse(stored.state).schemaVersion, 1);

  // Deploy: new code identity, runtime and GameTable restart from storage.
  await worker.setOptions({
    ...options,
    bindings: { ...options.bindings, BUILD_ID: 'build-2' },
  });
  db = await worker.getD1Database('DB');
  const after = await snapshot();
  assert.ok(after.every((v) => v.build === 'build-2'));
  assert.deepEqual(after.map(essentials), before.map(essentials));
  // A seat reconnects through the normal handshake and sees the new build.
  const [helloAfter, view] = await hello(tokens8[0], code);
  assert.equal(helloAfter.buildId, 'build-2');
  assert.equal(view.type, 'view');
  assert.equal(view.apiVersion, 1);
  assert.equal(view.version, before[1].version);
  assert.equal(view.data.me, before[1].me);
  // The game continues after the deploy: the next host action commits.
  const version = (await req('/api/game', { token: host })).version;
  await act({
    action: 'chat',
    to: 'all',
    text: 'Still here after the deploy.',
  });
  assert.ok((await req('/api/game', { token: host })).version > version);
  console.log(
    'Deploy integration passed: state intact across a restart with a new build, sockets reconnect, schema versioned.',
  );
} finally {
  await worker.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
}
