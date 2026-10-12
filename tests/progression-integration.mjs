// Local-only D1 fixtures exercise the actual routes and atomic persistence.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = process.env.CT_TEST_URL ?? 'http://localhost:3000';
const prefix = 'progress-' + randomBytes(4).toString('hex');
const ids = Array.from({ length: 7 }, (_, i) => `${prefix}-${i}`);
const handles = ids.map((_, i) => `xp_${prefix.slice(-8)}_${i}`);
const accounts = ids.map(() => randomBytes(32).toString('base64url'));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const rooms = [];
mkdirSync('work', { recursive: true });
function sql(content) {
  writeFileSync('work/progression-fixture.sql', content);
  execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--persist-to',
      process.env.CT_D1_PERSIST || '.wrangler/state',
      '--config',
      'wrangler.local.json',
      '--file',
      'work/progression-fixture.sql',
    ],
    {
      stdio: 'pipe',
      env: { ...process.env, WRANGLER_LOG_PATH: '.wrangler/logs' },
    },
  );
}
sql(`INSERT INTO accounts(id,name,email,created,handle) VALUES ${ids.map((id, i) => `('${id}','Progress ${i}','${id}@example.invalid',0,'${handles[i]}')`).join(',')};
INSERT INTO account_sessions(hash,account,expires) VALUES ${ids.map((id, i) => `('${hash(accounts[i])}','${id}',${Date.now() + 600000})`).join(',')};`);
async function call(path, account = '', body, member = '') {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': prefix,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
      ...(member ? { Authorization: 'Bearer ' + member } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
async function ok(p) {
  const r = await p;
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const social = (i, body) => call('/api/social', accounts[i], body);
async function action(room, command, seat = room.host) {
  const state = await ok(call('/api/game', '', undefined, seat));
  return ok(
    call('/api/game', '', { ...command, version: state.version }, seat),
  );
}
async function setup(guest = false, script = 'horrors') {
  const created = await ok(
    call('/api/session', accounts[0], {
      action: 'create',
      name: 'XP Storyteller',
    }),
  );
  const room = { code: created.code, host: created.token, seats: [] };
  rooms.push(room);
  for (let i = 1; i <= 5; i++) {
    const joined = await ok(
      call('/api/session', guest && i === 5 ? '' : accounts[i], {
        action: 'join',
        code: room.code,
        name: `XP ${i}`,
      }),
    );
    room.seats.push(joined.token);
    await ok(
      call('/api/game', '', { action: 'claimSeat', seat: i }, joined.token),
    );
  }
  if (script !== 'horrors') await action(room, { action: 'setScript', script });
  await action(room, { action: 'randomAssign' });
  if (script === 'horrors') {
    const state = await ok(call('/api/game', '', undefined, room.host));
    for (const [i, role] of [
      'sheriff',
      'hoflibrarian',
      'teacher',
      'basilisk',
      'monster',
    ].entries()) {
      const p = state.players[i];
      await action(room, {
        action: 'edit',
        player: p.id,
        name: p.name,
        role,
        alive: true,
        ghost: true,
      });
    }
  }
  return room;
}
try {
  const first = await setup(true);
  await action(first, { action: 'setRanked', ranked: true });
  const guestRejected = await call(
    '/api/game',
    '',
    {
      action: 'start',
      version: (await ok(call('/api/game', '', undefined, first.host))).version,
    },
    first.host,
  );
  assert.equal(guestRejected.status, 400);
  assert.match(guestRejected.data.error, /Everyone/);
  assert.equal(
    (await ok(call('/api/game', '', undefined, first.host))).phase,
    'lobby',
  );
  await ok(
    call('/api/accounts', accounts[5], { action: 'attach' }, first.seats[4]),
  );
  await action(first, { action: 'start' });
  const preview = await ok(call('/api/game', '', undefined, first.seats[0]));
  assert.deepEqual(preview.ratingPreview, {
    rating: 1000,
    win: 638,
    loss: -637,
  });
  const forbidden = await call(
    '/api/game',
    '',
    { action: 'setRanked', ranked: false, version: preview.version },
    first.seats[0],
  );
  assert.equal(forbidden.status, 400);
  const other = await setup(false, 'holyMoonStars');
  await action(other, { action: 'setRanked', ranked: true });
  const conflict = await call(
    '/api/game',
    '',
    {
      action: 'start',
      version: (await ok(call('/api/game', '', undefined, other.host))).version,
    },
    other.host,
  );
  assert.equal(conflict.status, 400);
  assert.match(conflict.data.error, /another ranked game/);
  assert.equal(
    (await ok(call('/api/game', '', undefined, other.host))).phase,
    'lobby',
    'failed reservation rolls back the whole game start',
  );
  await action(first, { action: 'end', winner: 'evil' });
  let me = await ok(social(1));
  assert.equal(me.stats.elo, 363);
  assert.equal(me.stats.progression.xp, 100);
  assert.equal(me.stats.ranked.played, 1);
  assert.equal(me.stats.scripts[0].script, 'horrors');
  assert.equal(me.stats.roleTypes[0].type, 'townsfolk');
  assert.equal(me.stats.averageOpponentElo, 1000);
  assert.equal(me.stats.averageTeamElo, 1000);
  assert.equal((await ok(social(4))).stats.elo, 1638);
  assert.equal((await ok(social(0))).stats.progression.xp, 300);
  for (let i = 0; i < 3; i++)
    await ok(call('/api/game', '', undefined, first.seats[0]));
  assert.equal(
    (await ok(social(1))).stats.progression.xp,
    100,
    'polls cannot duplicate XP',
  );
  const ended = await ok(call('/api/game', '', undefined, first.host));
  const recap = ended.recaps.at(-1),
    players = recap.players;
  const vote = (token, index) =>
    action(
      first,
      { action: 'mvpVote', recap: recap.id, player: players[index].id },
      token,
    );
  await vote(first.seats[0], 1);
  await vote(first.seats[1], 0);
  await vote(first.seats[2], 0);
  for (const i of [0, 1, 2]) await vote(first.host, i);
  me = await ok(social(1));
  assert.equal(me.stats.progression.xp, 150);
  assert.equal(me.stats.mvpVotes, 3);
  assert.equal(me.stats.mvpXp, 50);
  assert.ok(
    !JSON.stringify(
      await ok(call('/api/game', '', undefined, first.seats[0])),
    ).includes(ids[2]),
  );
  await action(first, { action: 'undo' });
  me = await ok(social(1));
  assert.equal(me.stats.elo, 1000);
  assert.equal(me.stats.progression.xp, 0);
  assert.equal(me.stats.games, 0);
  await action(first, { action: 'end', winner: 'good' });
  assert.equal((await ok(social(1))).stats.elo, 1638);
  await action(first, { action: 'returnLobby' });
  const archived = (
    await ok(call('/api/game', '', undefined, first.host))
  ).recaps.at(-1);
  await action(
    first,
    { action: 'mvpVote', recap: archived.id, player: archived.players[0].id },
    first.seats[1],
  );
  assert.equal(
    (await ok(social(1))).stats.progression.xp,
    250,
    'archived MVP vote updates the existing reward',
  );
  await action(other, { action: 'start' });
  assert.equal(
    (await ok(call('/api/game', '', undefined, other.seats[0]))).ratingPreview
      .rating,
    1638,
    'next game sees settled Elo',
  );
  await action(other, { action: 'end', winner: 'good' });
  me = await ok(social(1));
  assert.equal(me.stats.games, 2);
  assert.equal(me.stats.scripts.length, 2);
  assert.equal(me.stats.ranked.played, 2);
  const both = me.stats.progression.xp;
  // Casual rematch preserves history and never changes Elo.
  await action(first, { action: 'setRanked', ranked: false });
  await action(first, { action: 'randomAssign' });
  const priorElo = me.stats.elo;
  await action(first, { action: 'start' });
  await action(first, { action: 'end', winner: 'good' });
  me = await ok(social(1));
  assert.equal(me.stats.games, 3);
  assert.equal(me.stats.elo, priorElo);
  assert.ok(me.stats.progression.xp > both);
  const settledXp = me.stats.progression.xp;
  // Routine polling must not rewrite durable game records.
  sql(
    `UPDATE game_players SET mvp_votes=0,mvp_xp=0 WHERE game='${archived.id}';`,
  );
  const afterInterruptedWrite = (await ok(social(1))).stats.progression.xp;
  assert.ok(afterInterruptedWrite < settledXp);
  await ok(call('/api/game', '', undefined, first.host));
  assert.equal(
    (await ok(social(1))).stats.progression.xp,
    afterInterruptedWrite,
  );
  // Visibility is enforced for strangers, friends, self, direct history and blocks.
  const profile = () =>
    call('/api/social/profile?handle=' + handles[1], accounts[6]);
  assert.equal((await ok(profile())).games, null);
  await ok(
    social(1, {
      action: 'privacy',
      privacy: {
        stats: 'public',
        history: 'private',
        requests: 'nobody',
        invites: 'nobody',
      },
    }),
  );
  assert.ok((await ok(profile())).stats);
  assert.equal((await ok(profile())).recent, null);
  assert.equal(
    (await call('/api/social/history?handle=' + handles[1], accounts[6]))
      .status,
    403,
  );
  assert.equal(
    (await social(6, { action: 'request', handle: handles[1] })).status,
    400,
  );
  await ok(
    social(1, {
      action: 'privacy',
      privacy: {
        stats: 'private',
        history: 'public',
        requests: 'everyone',
        invites: 'friends',
      },
    }),
  );
  assert.equal((await ok(profile())).stats, null);
  assert.equal((await ok(profile())).recent.length, 3);
  assert.equal(
    (await ok(call('/api/social/history?handle=' + handles[1], accounts[6])))
      .games.length,
    3,
  );
  assert.equal(
    (await ok(call('/api/social/profile?handle=' + handles[1], accounts[1])))
      .stats.games,
    3,
  );
  assert.equal(
    (await social(1, { action: 'privacy', privacy: { stats: 'invalid' } }))
      .status,
    400,
  );
  await ok(social(1, { action: 'block', account: ids[6] }));
  assert.equal((await profile()).status, 400);
  const blockedSelf = await ok(
    call('/api/social/profile?handle=' + handles[6], accounts[1]),
  );
  assert.equal(blockedSelf.stats, null);
  assert.equal(blockedSelf.recent, null);
  assert.equal(blockedSelf.games, null);
  assert.equal(
    (await call('/api/social/history?handle=' + handles[1], accounts[6]))
      .status,
    403,
  );
  assert.equal(
    (await call('/api/social/history?offset=-1', accounts[1])).status,
    400,
  );
  assert.equal((await call('/api/social/history', '')).status, 401);
  await ok(social(1, { action: 'unblock', account: ids[6] }));
  const mutual = await Promise.all([
    social(2, { action: 'request', handle: handles[6] }),
    social(6, { action: 'request', handle: handles[2] }),
  ]);
  assert.ok(
    mutual.every((r) => r.status === 200),
    JSON.stringify(mutual),
  );
  assert.equal(
    (await ok(social(2))).friends.filter((f) => f.id === ids[6]).length,
    1,
  );
  const inviteRoom = await ok(
    call('/api/session', accounts[6], {
      action: 'create',
      name: 'Invitation QA',
    }),
  );
  rooms.push({ code: inviteRoom.code });
  const invite = () =>
    call(
      '/api/social',
      accounts[6],
      { action: 'invite', code: inviteRoom.code, account: ids[2] },
      inviteRoom.token,
    );
  await ok(invite());
  const disabled = (await ok(social(2))).invites[0].id;
  await ok(
    social(2, {
      action: 'privacy',
      privacy: {
        stats: 'friends',
        history: 'friends',
        requests: 'everyone',
        invites: 'nobody',
      },
    }),
  );
  assert.equal((await ok(social(2))).invites.length, 0);
  assert.equal(
    (
      await social(2, {
        action: 'acceptInvite',
        invite: disabled,
        name: 'Disabled',
      })
    ).status,
    400,
  );
  await ok(
    social(2, {
      action: 'privacy',
      privacy: {
        stats: 'friends',
        history: 'friends',
        requests: 'everyone',
        invites: 'friends',
      },
    }),
  );
  await ok(invite());
  const pending = (await ok(social(2))).invites[0].id;
  const accepted = await Promise.all(
    ['Once', 'Twice'].map((name) =>
      social(2, { action: 'acceptInvite', invite: pending, name }),
    ),
  );
  assert.deepEqual(
    accepted.map((r) => r.status).sort((a, b) => a - b),
    [200, 400],
  );
  assert.equal(
    (await ok(call('/api/game', '', undefined, inviteRoom.token))).players
      .length,
    1,
    'one invitation creates exactly one seat',
  );
  await ok(social(6, { action: 'request', handle: handles[4] }));
  await ok(social(4, { action: 'accept', account: ids[6] }));
  await ok(
    call(
      '/api/social',
      accounts[6],
      { action: 'invite', code: inviteRoom.code, account: ids[4] },
      inviteRoom.token,
    ),
  );
  const removedInvite = (await ok(social(4))).invites[0].id;
  await ok(social(4, { action: 'remove', account: ids[6] }));
  assert.equal((await ok(social(4))).invites.length, 0);
  assert.equal(
    (
      await social(4, {
        action: 'acceptInvite',
        invite: removedInvite,
        name: 'Removed',
      })
    ).status,
    400,
  );
  const sandbox = await ok(
    call('/api/session', accounts[6], {
      action: 'createSandbox',
      name: 'XP Sandbox QA',
    }),
  );
  const sandboxRoom = { code: sandbox.code, host: sandbox.token };
  rooms.push(sandboxRoom);
  for (let i = 0; i < 5; i++)
    await action(sandboxRoom, { action: 'addDummy', name: `Sandbox ${i}` });
  await action(sandboxRoom, { action: 'randomAssign' });
  await action(sandboxRoom, { action: 'start' });
  await action(sandboxRoom, { action: 'end', winner: 'good' });
  assert.equal(
    (await ok(social(6))).stats.progression.xp,
    0,
    'sandbox games never grant XP',
  );
  assert.equal(
    (await ok(social(6))).stats.storyteller.games,
    0,
    'sandbox games do not enter account records',
  );
  const paginationRows = Array.from({ length: 21 }, (_, i) => {
    const game = `${prefix}-history:${i}`,
      ended = Date.now() + i;
    return `INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended) VALUES ('${game}','QATEST','${ids[0]}','History fixture','good','Good',5,1,1,${ended - 60000},${ended}); INSERT INTO game_players(game,player,account,name,role,team,won,alive) VALUES ('${game}','history-player','${ids[6]}','History QA','teacher','good',1,1);`;
  });
  sql(paginationRows.join('\n'));
  const firstPage = await ok(call('/api/social/history', accounts[6]));
  assert.equal(firstPage.games.length, 20);
  assert.equal(firstPage.nextOffset, 20);
  const lastPage = await ok(call('/api/social/history?offset=20', accounts[6]));
  assert.equal(lastPage.games.length, 1);
  assert.equal(lastPage.nextOffset, null);
  assert.equal(
    new Set([...firstPage.games, ...lastPage.games].map((g) => g.id)).size,
    21,
  );
  assert.equal(firstPage.games[0].id, `${prefix}-history:20`);
  assert.equal(lastPage.games[0].id, `${prefix}-history:0`);
  console.log(
    'PASS: ranked eligibility and atomic locks, frozen predictions, XP/MVP shares, idempotence, rewinds, archived vote recovery, rematches, script breakdowns, casual Elo, API privacy, mutual requests and single-use invitations.',
  );
} finally {
  sql(
    `DELETE FROM games WHERE host_account IN (${ids.map((id) => `'${id}'`).join(',')}); DELETE FROM sessions WHERE code IN (${rooms.map((r) => `'${r.code}'`).join(',') || "''"}); DELETE FROM accounts WHERE id IN (${ids.map((id) => `'${id}'`).join(',')});`,
  );
}
