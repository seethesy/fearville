import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { claimSeats } from './claim-seats.mjs';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const prefix = 'hub-' + randomBytes(6).toString('hex');
const ids = Array.from({ length: 4 }, (_, i) => `${prefix}-${i}`);
const tokens = ids.map(() => randomBytes(32).toString('base64url'));
const rooms = [];
mkdirSync('work', { recursive: true });
function sql(source) {
  writeFileSync('work/hub-fixture.sql', source);
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
      'work/hub-fixture.sql',
    ],
    { stdio: 'pipe' },
  );
}
async function call(path, account, body, member) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': prefix,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
      ...(member ? { Authorization: 'Bearer ' + member } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
async function ok(promise) {
  const result = await promise;
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}
sql(
  `INSERT INTO accounts(id,name,email,created) VALUES ${ids.map((id, i) => `('${id}','Hub ${i}','${id}@example.invalid',0)`).join(',')}; INSERT INTO account_sessions(hash,account,expires) VALUES ${ids.map((id, i) => `('${createHash('sha256').update(tokens[i]).digest('hex')}','${id}',${Date.now() + 3600000})`).join(',')};`,
);
try {
  for (const action of ['create', 'createSandbox'])
    assert.equal(
      (await call('/api/session', '', { action, name: 'Guest' })).status,
      401,
    );
  const handle = 'hu_' + prefix.slice(4);
  await ok(
    call('/api/accounts', tokens[0], {
      action: 'handle',
      handle: handle.toUpperCase(),
    }),
  );
  assert.equal(
    (await ok(call('/api/accounts', tokens[0]))).account.handle,
    handle,
  );
  assert.equal(
    (
      await call('/api/accounts', tokens[1], {
        action: 'handle',
        handle: handle.toUpperCase(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('/api/accounts', tokens[0], {
        action: 'handle',
        handle: handle + 'x',
      })
    ).status,
    400,
  );
  await ok(call('/api/accounts', tokens[0], { action: 'handle', handle })); // No-op preserves cooldown.
  sql(
    `UPDATE accounts SET handle_changed_at=${Date.now() - 31 * 86400000} WHERE id='${ids[0]}';`,
  );
  const renames = await Promise.all(
    ['a', 'b'].map((suffix) =>
      call('/api/accounts', tokens[0], {
        action: 'handle',
        handle: handle + suffix,
      }),
    ),
  );
  assert.deepEqual(
    renames.map((r) => r.status).sort((a, b) => a - b),
    [200, 400],
  );
  for (const token of tokens.slice(1, 3))
    await ok(
      call('/api/accounts', token, {
        action: 'profile',
        lobbyName: 'Same name',
        avatar: 'ghost',
        deathEffect: 'embers',
      }),
    );
  assert.equal(
    (
      await call('/api/accounts', tokens[1], {
        action: 'profile',
        lobbyName: 'Name',
        avatar: 'invalid',
        deathEffect: 'embers',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call('/api/accounts', tokens[1], {
        action: 'preferences',
        settings: { music: 101 },
      })
    ).status,
    400,
  );
  const host = await ok(call('/api/session', tokens[0], { action: 'create' }));
  rooms.push(host.code);
  assert.match(host.code, /^[0-9]{6}$/);
  const a = await ok(
    call('/api/session', tokens[1], { action: 'join', code: host.code }),
  );
  const b = await ok(
    call('/api/session', tokens[2], { action: 'join', code: host.code }),
  );
  let game = await ok(call('/api/game', '', undefined, host.token));
  assert.deepEqual(
    game.players.map((p) => p.name),
    ['Same name', 'Same name'],
  );
  assert.equal(game.players[0].avatar, 'ghost');
  assert.notEqual(game.players[1].avatar, 'ghost');
  assert.ok(game.players.every((p) => p.deathEffect === 'embers'));
  assert.equal(
    (await ok(call('/api/accounts', tokens[2]))).profile.avatar,
    'ghost',
  );
  const resumed = await ok(
    call('/api/session', tokens[1], { action: 'join', code: host.code }),
  );
  assert.equal(resumed.resumed, true);
  assert.equal(
    (await ok(call('/api/game', '', undefined, resumed.token))).me,
    game.players[0].id,
  );
  sql(
    `INSERT INTO friendships(requester,addressee,status,created,updated) VALUES ('${ids[1]}','${ids[2]}','accepted',0,0);`,
  );
  await ok(call('/api/accounts/presence', tokens[1], { online: true }));
  assert.equal(
    (await ok(call('/api/social', tokens[2]))).friends[0].online,
    true,
  );
  await ok(
    call('/api/accounts', tokens[1], {
      action: 'preferences',
      settings: { music: 25, sfx: 35, showOnline: false, reducedMotion: true },
    }),
  );
  assert.equal(
    (await ok(call('/api/social', tokens[2]))).friends[0].online,
    false,
  );
  assert.equal(
    (await ok(call('/api/accounts', tokens[1]))).profile.settings.music,
    25,
  );
  const members = [a, b];
  for (let i = 0; i < 3; i++)
    members.push(
      await ok(
        call('/api/session', '', {
          action: 'join',
          name: 'Guest ' + i,
          code: host.code,
        }),
      ),
    );
  await claimSeats(
    base,
    members.map((p) => p.token),
  );
  async function act(body, member = host.token) {
    game = await ok(call('/api/game', '', undefined, member));
    game = (
      await ok(
        call('/api/game', '', { ...body, version: game.version }, member),
      )
    ).game;
  }
  await act({ action: 'randomAssign' });
  await act({ action: 'start' });
  await act(
    {
      action: 'saveNotebook',
      started: game.gameStartedAt,
      notebook: { text: 'A lasting clue', roles: {}, players: {} },
    },
    a.token,
  );
  await act({ action: 'end', winner: 'good' });
  const recap = game.recaps.at(-1).id,
    target = game.players[0].id;
  await act({ action: 'mvpVote', recap, player: target }, b.token);
  const saved = await ok(
    call('/api/social/recap?id=' + encodeURIComponent(recap), tokens[1]),
  );
  assert.equal(
    saved.recaps[0].players.find((p) => p.id === target).notebook.text,
    'A lasting clue',
  );
  assert.equal(saved.recaps[0].mvpCounts[target], 1);
  assert.ok(!('progression' in saved.recaps[0]));
  assert.ok(!('votes' in saved.recaps[0]));
  assert.equal(
    (await call('/api/social/recap?id=' + encodeURIComponent(recap), tokens[3]))
      .status,
    404,
  );
  assert.equal(
    (await call('/api/social/recap?id=' + encodeURIComponent(recap))).status,
    401,
  );
  await act({ action: 'returnLobby', recap });
  await ok(call('/api/session', '', { action: 'leaveLobby' }, a.token));
  assert.equal((await call('/api/game', '', undefined, a.token)).status, 401);
  await ok(call('/api/session', '', { action: 'deleteLobby' }, host.token));
  assert.equal(
    (
      await ok(
        call('/api/social/recap?id=' + encodeURIComponent(recap), tokens[1]),
      )
    ).recaps[0].id,
    recap,
  );
  console.log(
    'PASS: guest hosting restrictions, numeric codes, unique usernames and cooldown/races, saved cosmetics and duplicate presets, same-name players, account rejoin, presence/privacy, durable participant-only recaps, leaving and closing lobbies.',
  );
} finally {
  sql(
    rooms
      .map(
        (code) =>
          `DELETE FROM games WHERE code='${code}'; DELETE FROM sessions WHERE code='${code}';`,
      )
      .join('\n') +
      ids.map((id) => `DELETE FROM accounts WHERE id='${id}';`).join('\n'),
  );
}
