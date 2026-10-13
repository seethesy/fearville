import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Miniflare } from 'miniflare';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { view } from '../lib/game/view.ts';
import { assembleGame } from '../lib/game/parts.ts';
const root = path.resolve('dist/server');
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .sort((a, b) => Number(b === 'index.js') - Number(a === 'index.js'));
const worker = new Miniflare({
  name: 'socket-test',
  modules: files.map((file) => ({
    type: 'ESModule',
    path: path.join(root, file),
    contents: fs.readFileSync(path.join(root, file), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'socket-test' },
  durableObjects: { GAME_TABLE: { className: 'GameTable', useSQLite: true } },
});
const clients = [];
const sha = (s) => createHash('sha256').update(s).digest('hex');
try {
  await worker.ready;
  const db = await worker.getD1Database('DB');
  for (const file of fs
    .readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    let source = fs
      .readFileSync(path.join('drizzle', file), 'utf8')
      .replace(/--[^\n]*/g, '');
    const triggers = [];
    source = source.replace(/CREATE TRIGGER[\s\S]*?END;/gi, (s) => {
      triggers.push(s);
      return '';
    });
    for (const statement of [
      ...source
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      ...triggers,
    ])
      await db.prepare(statement).run();
  }
  const game = newGame('123456', 'Socket host');
  game.gameStartedAt = 1;
  game.phase = 'night';
  game.night = 1;
  game.players = Array.from({ length: 18 }, (_, i) => ({
    ...newPlayer(`P${i}`, i + 1),
    role: i === 17 ? 'monster' : 'watchman',
    shown: i === 17 ? 'monster' : 'watchman',
  }));
  game.notebooks = Object.fromEntries(
    game.players.map((p) => [
      p.id,
      { roles: {}, players: {}, text: 'secret notebook ' + p.id },
    ]),
  );
  game.messages = game.players.map((p) => ({
    id: randomUUID(),
    to: p.id,
    from: 'host',
    kind: 'info',
    text: 'secret information ' + p.id,
    at: 1,
  }));
  const actors = [
    { id: 'host', host: true },
    ...game.players.map((p) => ({ id: p.id, host: false })),
  ];
  const tokens = actors.map(() => randomUUID());
  await db
    .prepare(
      'INSERT INTO sessions(code,state,version,created) VALUES (?,?,0,1)',
    )
    .bind(game.code, JSON.stringify(game))
    .run();
  for (let i = 0; i < 19; i++)
    await db
      .prepare(
        'INSERT INTO members(token_hash,code,player,host,expires) VALUES (?,?,?,?,?)',
      )
      .bind(
        sha(tokens[i]),
        game.code,
        actors[i].id,
        Number(actors[i].host),
        Date.now() + 3600000,
      )
      .run();
  async function request(token, body) {
    const response = await worker.dispatchFetch('http://localhost/api/game', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  }
  for (let i = 0; i < 19; i++) {
    const response = await worker.dispatchFetch(
      'http://localhost/api/table/socket?code=' + game.code,
      {
        headers: {
          Upgrade: 'websocket',
          Authorization: 'Bearer ' + tokens[i],
          'cf-connecting-ip': `socket-${i}`,
        },
      },
    );
    assert.equal(response.status, 101);
    const socket = response.webSocket,
      frames = [];
    socket.addEventListener('message', (event) =>
      frames.push(JSON.parse(event.data)),
    );
    socket.accept();
    const client = {
      socket,
      frames,
      async next(predicate) {
        const deadline = Date.now() + 20000;
        for (;;) {
          const frame = frames.find(predicate);
          if (frame) return frame;
          if (Date.now() > deadline) throw Error('Socket view did not arrive.');
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
    };
    clients.push(client);
    const hello = await client.next((f) => f.type === 'hello');
    assert.equal(hello.apiVersion, 1);
    assert.ok(hello.buildId.length > 0);
    await client.next((f) => f.type === 'view');
  }
  const result = await request(tokens[0], {
    action: 'chat',
    to: 'all',
    text: 'Everyone receives this',
    messageId: randomUUID(),
    requestId: 'timing-public',
  });
  const version = result.game.version;
  const row = await db
    .prepare(
      'SELECT state,(SELECT json_group_array(json_array(part,state)) FROM session_parts WHERE code=s.code) AS parts FROM sessions s WHERE code=?',
    )
    .bind(game.code)
    .first();
  const stored = assembleGame(row.state, JSON.parse(row.parts)).game;
  for (let i = 0; i < 19; i++) {
    const frame = await clients[i].next(
      (f) => f.type === 'view' && f.version === version,
    );
    assert.equal(frame.cause, 'timing-public');
    assert.deepEqual(
      frame.data,
      JSON.parse(
        JSON.stringify({
          ...view(stored, actors[i], version, frame.serverNow),
          blockedChatSenders: [],
        }),
      ),
    );
    if (i > 0)
      for (const other of game.players.filter((p) => p.id !== actors[i].id)) {
        const content = JSON.stringify(frame.data);
        assert.ok(!content.includes('secret notebook ' + other.id));
        assert.ok(!content.includes('secret information ' + other.id));
      }
  }
  const privateResult = await request(tokens[1], {
    action: 'chat',
    text: 'Private to host',
    messageId: randomUUID(),
  });
  await clients[0].next(
    (f) => f.type === 'view' && f.version === privateResult.game.version,
  );
  await clients[1].next(
    (f) => f.type === 'view' && f.version === privateResult.game.version,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const client of clients.slice(2))
    assert.ok(
      !client.frames.some(
        (f) => f.type === 'view' && f.version === privateResult.game.version,
      ),
      'unchanged viewer gets no push',
    );
  const revoked = clients[18];
  const closed = new Promise((resolve) =>
    revoked.socket.addEventListener('close', resolve, { once: true }),
  );
  await db
    .prepare('DELETE FROM members WHERE token_hash=?')
    .bind(sha(tokens[18]))
    .run();
  await request(tokens[0], {
    action: 'chat',
    to: 'all',
    text: 'After revocation',
    messageId: randomUUID(),
  });
  const event = await Promise.race([
    closed,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error('Revoked socket stayed open')), 10000),
    ),
  ]);
  assert.equal(event.code, 1008);
  const denied = await worker.dispatchFetch(
    'http://localhost/api/table/socket?code=654321',
    { headers: { Upgrade: 'websocket', Authorization: 'Bearer ' + tokens[0] } },
  );
  assert.equal(denied.status, 401);
  const endedRow = await db
    .prepare(
      'SELECT state,(SELECT json_group_array(json_array(part,state)) FROM session_parts WHERE code=s.code) AS parts FROM sessions s WHERE code=?',
    )
    .bind(game.code)
    .first();
  const ended = assembleGame(endedRow.state, JSON.parse(endedRow.parts)).game;
  ended.phase = 'ended';
  ended.winner = 'Good';
  ended.gameEndedAt = Date.now();
  await db
    .prepare('UPDATE sessions SET state=?,version=version+1 WHERE code=?')
    .bind(JSON.stringify(ended), game.code)
    .run();
  const compactResponse = await worker.dispatchFetch(
    'http://localhost/api/game?compactRecaps=1',
    { headers: { Authorization: 'Bearer ' + tokens[0] } },
  );
  const compact = await compactResponse.json();
  assert.equal(compactResponse.status, 200);
  assert.equal(compact.recaps[0].detailsDeferred, true);
  assert.deepEqual(compact.recaps[0].messages, []);
  const detailResponse = await worker.dispatchFetch(
    'http://localhost/api/table/recap?id=' +
      encodeURIComponent(compact.recaps[0].id),
    { headers: { Authorization: 'Bearer ' + tokens[0] } },
  );
  const details = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(details.recap.messages.length, ended.messages.length);
  assert.equal(details.recap.detailsDeferred, undefined);
  console.log(
    'PASS: 19 real hibernating sockets, per-viewer equality/privacy, hash suppression, action timing and revoked credentials.',
  );
} finally {
  for (const client of clients)
    try {
      client.socket.close();
    } catch {
      /* already closed */
    }
  await worker.dispose();
}
