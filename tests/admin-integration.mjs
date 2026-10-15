// Isolated, ephemeral D1 and Worker. No deployed credentials, no OAuth bypass
// route. Test fixtures are inserted directly into this process's local DB.
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
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fearville-admin-'));
const email = 'sybertechlabs@gmail.com';
const options = {
  name: 'admin-test',
  modules: files.map((f) => ({
    type: 'ESModule',
    path: path.join(root, f),
    contents: fs.readFileSync(path.join(root, f), 'utf8'),
  })),
  modulesRoot: root,
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'admin-tests' },
  d1Persist: directory,
  durableObjects: { GAME_TABLE: { className: 'GameTable', useSQLite: true } },
  durableObjectsPersist: directory,
  bindings: { ADMIN_EMAIL_ALLOWLIST: email },
};
const worker = new Miniflare(options);
let db;
const digest = (s) => createHash('sha256').update(s).digest('hex');
const tokens = {};
let requests = 0;
async function fixture(
  id,
  role = 'player',
  provider = 'google',
  verified = email,
  issued = Date.now(),
  expires = Date.now() + 3600000,
) {
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
    .bind(digest(token), id, expires, provider, verified, issued)
    .run();
  return token;
}
async function req(route, account, body, extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'cf-connecting-ip': 'admin-test-' + ++requests,
    ...(account
      ? { 'X-Account-Authorization': 'Bearer ' + (tokens[account] ?? account) }
      : {}),
    ...extra,
  };
  const response = await worker.dispatchFetch('http://localhost' + route, {
    headers,
    ...(body === undefined
      ? {}
      : { method: 'POST', body: JSON.stringify(body) }),
  });
  const data = await response.json();
  return { status: response.status, ...data };
}
async function command(input, confirm = false) {
  let confirmation;
  if (confirm) {
    const preview = await req('/api/admin', 'admin', { command: input });
    if (preview.status !== 200) return preview;
    confirmation = preview.confirmation;
  }
  return req('/api/admin', 'admin', {
    command: input,
    ...(confirmation ? { confirmation } : {}),
  });
}
async function ok(input, confirm = false) {
  const r = await command(input, confirm);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r;
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
  await fixture('admin', 'admin');
  await fixture('alice');
  await fixture('bob');
  await fixture('expired', 'admin', 'google', email, Date.now() - 3600001);
  await fixture('appleadmin', 'admin', 'apple');
  await fixture('unverified', 'admin', 'google', '');
  for (const who of [
    undefined,
    'alice',
    'expired',
    'appleadmin',
    'unverified',
    'tampered-token',
  ]) {
    for (const route of [
      '/api/admin',
      '/api/admin?view=history&key=home.welcome',
    ])
      assert.equal((await req(route, who)).status, 403, who);
    for (const body of [
      { command: 'xp give alice 50' },
      { action: 'text', key: 'home.welcome', value: 'Changed', version: 0 },
    ])
      assert.equal((await req('/api/admin', who, body)).status, 403, who);
  }
  assert.equal((await req('/api/accounts', 'admin')).account.role, 'admin');
  for (const action of ['create', 'createSandbox', 'join'])
    assert.equal(
      (
        await req('/api/session', 'admin', {
          action,
          name: 'Admin',
          code: '123456',
        })
      ).status,
      403,
    );
  for (const action of ['attach', 'resume', 'profile', 'handle'])
    assert.equal((await req('/api/accounts', 'admin', { action })).status, 403);
  assert.equal(
    (await req('/api/social', 'admin', { action: 'acceptInvite', invite: 'x' }))
      .status,
    403,
  );
  assert.equal(
    (
      await req(
        '/api/admin',
        'admin',
        { command: 'help' },
        { Origin: 'https://evil.invalid' },
      )
    ).status,
    400,
  );
  assert.ok((await ok('help')).output.length >= 20);
  assert.equal((await ok('xp give alice 500')).output.level, 2);
  assert.equal((await ok('xp remove alice 900')).output.xp, 0);
  assert.equal((await ok('xp set alice 800')).output.xp, 800);
  assert.equal((await command('xp give alice -1')).status, 400);
  assert.equal((await command('xp give nobody 1')).status, 400);
  assert.equal((await command('grant alice unknown')).status, 400);
  await ok('grant alice title:founder');
  assert.ok(
    (await req('/api/accounts', 'alice')).items.includes('title:founder'),
  );
  await ok('revoke alice title:founder');
  assert.deepEqual((await req('/api/accounts', 'alice')).items, []);
  for (const name of ['ban', 'reset', 'signout', 'unban', 'mute', 'grant'])
    assert.equal(
      (
        await command(
          name + ' admin' + (name === 'grant' ? ' title:founder' : ''),
          true,
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await req('/api/admin', 'admin', {
        command: 'reset alice',
        confirmation: 'reset alice',
      })
    ).status,
    400,
  );
  const preview = await ok('reset alice');
  assert.ok(preview.confirmationRequired);
  assert.equal((await ok('inspect alice')).output.xp, 800);
  await ok('xp give alice 1');
  assert.equal(
    (
      await req('/api/admin', 'admin', {
        command: 'reset alice',
        confirmation: preview.confirmation,
      })
    ).status,
    400,
  );
  await ok('reset alice', true);
  assert.equal((await ok('inspect alice')).output.xp, 0);
  // Every mutation and its audit record must commit or roll back together.
  await db
    .prepare(
      "CREATE TRIGGER test_audit_failure BEFORE INSERT ON admin_audit WHEN NEW.result='success' BEGIN SELECT RAISE(ABORT,'Test audit failure'); END",
    )
    .run();
  assert.notEqual((await command('xp give alice 100')).status, 200);
  assert.equal(
    (
      await db
        .prepare('SELECT xp_offset FROM admin_progression WHERE account=?')
        .bind('alice')
        .first()
    ).xp_offset,
    0,
  );
  await db.prepare('DROP TRIGGER test_audit_failure').run();
  const room = await req('/api/session', 'alice', {
    action: 'create',
    name: 'Alice',
  });
  assert.equal(room.status, 200, JSON.stringify(room));
  const joined = await req('/api/session', 'bob', {
    action: 'join',
    code: room.code,
    name: 'Bob',
  });
  assert.equal(joined.status, 200, JSON.stringify(joined));
  assert.equal((await ok('lobby ' + room.code)).output.players.length, 1);
  assert.ok((await ok('lobbies')).output.some((x) => x.code === room.code));
  await ok('mute bob 2');
  assert.equal(
    (
      await req(
        '/api/game',
        'bob',
        { action: 'chat', text: 'hello', to: 'host' },
        { Authorization: 'Bearer ' + joined.token },
      )
    ).status,
    400,
  );
  assert.equal(
    (await req('/api/social', 'bob', { action: 'request', handle: 'alice' }))
      .status,
    400,
  );
  await ok('unmute bob');
  assert.equal(
    (
      await req(
        '/api/game',
        'bob',
        { action: 'chat', text: 'hello', to: 'host' },
        { Authorization: 'Bearer ' + joined.token },
      )
    ).status,
    200,
  );
  await ok('mute bob 0');
  assert.equal(
    (
      await req(
        '/api/game',
        'bob',
        { action: 'chat', text: 'expired mute', to: 'host' },
        { Authorization: 'Bearer ' + joined.token },
      )
    ).status,
    200,
  );
  await ok('storyteller ' + room.code + ' bob');
  assert.equal(
    (
      await req('/api/game', undefined, undefined, {
        Authorization: 'Bearer ' + room.token,
      })
    ).status,
    401,
  );
  const bobView = await req('/api/accounts', 'bob');
  assert.equal(bobView.seats[0].host, 1);
  const resumed = await req('/api/accounts', 'bob', {
    action: 'resume',
    seat: bobView.seats[0].id,
  });
  assert.equal(resumed.status, 200);
  assert.equal(
    (
      await req('/api/game', 'bob', undefined, {
        Authorization: 'Bearer ' + resumed.token,
      })
    ).host,
    true,
  );
  await ok('signout bob');
  assert.equal((await req('/api/accounts', 'bob')).account, null);
  assert.equal(
    (
      await req('/api/game', undefined, undefined, {
        Authorization: 'Bearer ' + resumed.token,
      })
    ).status,
    401,
  );
  const end = await ok('endgame ' + room.code);
  assert.ok(end.confirmationRequired);
  await ok('endgame ' + room.code, true);
  assert.equal((await ok('lobby ' + room.code)).output.phase, 'ended');
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM games WHERE code=?')
        .bind(room.code)
        .first()
    ).n,
    0,
  );
  await fixture('charlie');
  const active = await req('/api/session', 'alice', {
    action: 'create',
    name: 'Alice',
  });
  const charlie = await req('/api/session', 'charlie', {
    action: 'join',
    code: active.code,
    name: 'Charlie',
  });
  const gameRow = await db
    .prepare('SELECT state FROM sessions WHERE code=?')
    .bind(active.code)
    .first();
  const activeGame = JSON.parse(gameRow.state);
  const victim = activeGame.players[0].id;
  activeGame.phase = 'night';
  activeGame.night = 1;
  activeGame.players[0].role = 'doctor';
  activeGame.players[0].shown = 'doctor';
  activeGame.nightChoices = { [victim]: {} };
  activeGame.nightIntroductions = { [victim]: { id: 'test', text: 'secret' } };
  activeGame.rite = {
    config: { enabled: true },
    seed: 'old',
    epoch: 'old',
    status: 'open',
    timerless: true,
    squads: [
      {
        id: 'test',
        kind: 'grid',
        members: [victim],
        state: {
          type: 'grid',
          solution: [],
          clues: [],
          placements: {},
          submissions: {},
        },
      },
    ],
    plans: [],
    resolvedNight: 0,
  };
  await db
    .prepare('UPDATE sessions SET state=?,version=version+1 WHERE code=?')
    .bind(JSON.stringify(activeGame), active.code)
    .run();
  await ok('kick charlie ' + active.code);
  const changedGame = (await ok('lobby ' + active.code)).output;
  const departed = JSON.parse(
    (
      await db
        .prepare('SELECT state FROM sessions WHERE code=?')
        .bind(active.code)
        .first()
    ).state,
  );
  assert.equal(changedGame.players.length, 0);
  assert.equal(departed.players[0].departed, true);
  const ritePart = JSON.parse(
    (
      await db
        .prepare("SELECT state FROM session_parts WHERE code=? AND part='rite'")
        .bind(active.code)
        .first()
    ).state,
  );
  assert.equal(ritePart.status, 'complete');
  assert.equal(departed.nightChoices[victim], undefined);
  assert.equal(
    (
      await req('/api/game', undefined, undefined, {
        Authorization: 'Bearer ' + charlie.token,
      })
    ).status,
    401,
  );
  await ok('ban alice repeated abuse', true);
  assert.equal((await req('/api/accounts', 'alice')).status, 403);
  assert.equal(
    (
      await req('/api/game', undefined, undefined, {
        Authorization: 'Bearer ' + active.token,
      })
    ).status,
    401,
  );
  assert.equal((await ok('lobby ' + active.code)).output.phase, 'ended');
  await ok('unban alice');
  assert.equal((await req('/api/accounts', 'alice')).account, null);
  // Inert markup, placeholder validation, reset and append-only revert.
  const markup = '<script>window.pwned=true</script>';
  const r = await req('/api/admin', 'admin', {
    action: 'text',
    key: 'home.welcome',
    value: markup,
    version: 0,
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  const published = (await req('/api/ui-text')).overrides['home.welcome'];
  assert.equal(published.value, markup);
  const original = published.version;
  assert.equal(
    (
      await req('/api/admin', 'admin', {
        action: 'text',
        key: 'home.welcome',
        value: 'stale',
        version: 0,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req('/api/admin', 'admin', {
        action: 'text',
        key: 'lobby.players',
        value: 'missing count',
        version: 0,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req('/api/admin', 'admin', {
        action: 'text',
        key: 'home.welcome',
        reset: true,
        version: original,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req('/api/ui-text')).overrides['home.welcome'].value,
    'Welcome to Fearville.',
  );
  await ok('text revert home.welcome ' + original);
  assert.equal(
    (await req('/api/ui-text')).overrides['home.welcome'].value,
    markup,
  );
  assert.equal((await ok('text history home.welcome')).output.length, 3);
  // FEAR-173: trusted editors, drafts, per-field publish, history and revert.
  await fixture('writer');
  assert.equal((await req('/api/ui-text?view=me', 'writer')).editor, false);
  const wiki = (body, who = 'writer') => req('/api/ui-text', who, body);
  assert.equal(
    (await wiki({ action: 'draft', key: 'glossary.fear.term', value: 'Dread' }))
      .status,
    403,
  );
  await ok('editor grant writer');
  assert.equal((await req('/api/ui-text?view=me', 'writer')).editor, true);
  assert.equal(
    (
      await wiki({
        action: 'draft',
        key: 'glossary.fear.term',
        value: 'Dread',
        summary: 'Try a new name',
      })
    ).status,
    200,
  );
  // Drafts never reach players.
  assert.equal(
    (await req('/api/ui-text')).overrides['glossary.fear.term'],
    undefined,
  );
  assert.equal(
    (await req('/api/ui-text?view=drafts', 'writer')).drafts['glossary.fear.term']
      .value,
    'Dread',
  );
  assert.equal((await req('/api/ui-text?view=drafts')).status, 403);
  assert.equal(
    (
      await wiki({
        action: 'draft',
        key: 'glossary.fear.definition',
        value: 'See [this](javascript:alert(1)).',
      })
    ).status,
    400,
  );
  assert.equal(
    (await wiki({ action: 'publish', key: 'glossary.fear.term', version: 0 }))
      .status,
    200,
  );
  assert.equal(
    (await req('/api/ui-text')).overrides['glossary.fear.term'].value,
    'Dread',
  );
  assert.equal(
    (await wiki({ action: 'publish', key: 'glossary.fear.term', version: 0 }))
      .status,
    400,
  );
  const textLog = (
    await req('/api/ui-text?view=history&key=glossary.fear.term', 'writer')
  ).history;
  assert.equal(textLog[0].editor, 'writer');
  assert.equal(textLog[0].summary, 'Try a new name');
  assert.equal(
    (await wiki({ action: 'revert', key: 'glossary.fear.term', to: 0 })).status,
    200,
  );
  assert.equal(
    (await req('/api/ui-text')).overrides['glossary.fear.term'].value,
    'Fear',
  );
  assert.ok(
    (await req('/api/admin?action=text%20publish', 'admin')).audit.some(
      (x) => x.admin === 'writer' && x.result === 'success',
    ),
  );
  await ok('editor revoke writer');
  assert.equal(
    (await wiki({ action: 'draft', key: 'home.welcome', value: 'Hi' })).status,
    403,
  );
  await assert.rejects(() =>
    db.prepare("UPDATE admin_audit SET action='tampered'").run(),
  );
  await assert.rejects(() => db.prepare('DELETE FROM ui_text_versions').run());
  const audit = await req('/api/admin?action=xp%20give&target=alice', 'admin');
  assert.ok(audit.audit.some((x) => x.result === 'success'));
  assert.ok(audit.audit.some((x) => x.result === 'error'));
  // Moderation queue actions are privileged, confirmed, auditable and atomic.
  await fixture('reporter');
  await fixture('reported');
  for (const id of ['dismiss', 'warn', 'remove', 'suspend'])
    await db
      .prepare(
        "INSERT INTO player_reports(id,kind,reason,reporter_account,target_account,target_name,content,created) VALUES (?,'player','harassment','reporter','reported','reported','reported',?)",
      )
      .bind(id, Date.now())
      .run();
  assert.equal((await req('/api/admin?view=reports')).status, 403);
  assert.equal((await req('/api/admin?view=reports', 'reporter')).status, 403);
  assert.equal(
    (await req('/api/admin?view=reports', 'admin')).reports.length,
    4,
  );
  await ok('report dismiss dismiss', true);
  await ok('report warn warn Respect other players', true);
  assert.equal(
    (await req('/api/accounts', 'reported')).warning,
    'Respect other players',
  );
  await ok('report remove remove', true);
  assert.equal(
    (
      await db
        .prepare("SELECT handle FROM accounts WHERE id='reported'")
        .first()
    ).handle,
    null,
  );
  assert.equal((await command('report dismiss dismiss', true)).status, 400);
  const moderationRoom = await req('/api/session', 'reporter', {
    action: 'create',
    name: 'Reporter',
  });
  const moderationSeat = await req('/api/session', 'reported', {
    action: 'join',
    code: moderationRoom.code,
    name: 'Reported',
  });
  const removedMessage = randomUUID();
  assert.equal(
    (
      await req(
        '/api/game',
        'reported',
        {
          action: 'chat',
          to: 'host',
          text: 'Remove this reported chat',
          messageId: removedMessage,
        },
        { Authorization: 'Bearer ' + moderationSeat.token },
      )
    ).status,
    200,
  );
  await db
    .prepare(
      "INSERT INTO player_reports(id,kind,reason,target_account,code,message_id,content,created) VALUES ('remove-chat','chat','other','reported',?,?,?,?)",
    )
    .bind(
      moderationRoom.code,
      removedMessage,
      'Remove this reported chat',
      Date.now(),
    )
    .run();
  await ok('report remove-chat remove', true);
  const moderatedView = await req('/api/game', 'reporter', undefined, {
    Authorization: 'Bearer ' + moderationRoom.token,
  });
  assert.ok(
    !moderatedView.messages.some((message) => message.id === removedMessage),
  );
  await db
    .prepare(
      "INSERT INTO games(id,code,host_account,host_name,winner,reason,players,days,nights,started,ended) VALUES ('moderation-rating','ABCDEF','reporter','Reporter','good','test',5,1,1,1,2)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO storyteller_ratings(game,rater,storyteller,stars,comment,created) VALUES ('moderation-rating','reported','reporter',4,'Remove this rating comment',2)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO player_reports(id,kind,reason,target_account,game,content,created) VALUES ('remove-rating','rating','other','reported','moderation-rating','Remove this rating comment',2)",
    )
    .run();
  await ok('report remove-rating remove', true);
  const moderatedRating = await db
    .prepare(
      "SELECT stars,comment FROM storyteller_ratings WHERE game='moderation-rating'",
    )
    .first();
  assert.equal(moderatedRating.stars, 4);
  assert.equal(moderatedRating.comment, '');
  await db
    .prepare(
      "CREATE TRIGGER report_audit_failure BEFORE INSERT ON admin_audit WHEN NEW.result='success' AND NEW.action='report' BEGIN SELECT RAISE(ABORT,'Test audit failure'); END",
    )
    .run();
  assert.notEqual((await command('report suspend suspend', true)).status, 200);
  assert.equal(
    (
      await db
        .prepare("SELECT banned FROM accounts WHERE id='reported'")
        .first()
    ).banned,
    null,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM player_reports WHERE id='suspend'")
        .first()
    ).status,
    'open',
  );
  await db.prepare('DROP TRIGGER report_audit_failure').run();
  await ok('report suspend suspend', true);
  assert.equal((await req('/api/accounts', 'reported')).status, 403);
  // Removing the configured allowlist revokes still-unexpired admin tokens.
  await worker.setOptions({
    ...options,
    bindings: { ADMIN_EMAIL_ALLOWLIST: '' },
  });
  assert.equal((await req('/api/admin', 'admin')).status, 403);
  await worker.setOptions(options);
  assert.equal(
    (await req('/api/accounts', 'admin', { action: 'signout' })).status,
    200,
  );
  assert.equal((await req('/api/admin', 'admin')).status, 403);
  console.log(
    'Admin integration passed: authorization, commands, moderation, transfers, transaction rollback, immutable text and allowlist revocation.',
  );
} finally {
  await worker.dispose();
  fs.rmSync(directory, { recursive: true, force: true });
}
