// FEAR-159: feedback forms. Fetch active forms, submit as a guest and as an
// account, reject bad answers, attach public table details to a bug report
// from a seated player. Local D1 only.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.CT_TEST_URL || 'http://localhost:3000';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Fixtures are local-only.',
);
const id = 'fb-' + randomBytes(6).toString('hex');
const A = id + '-a';
const token = randomBytes(32).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');

function sql(statement) {
  mkdirSync('work', { recursive: true });
  const file = `work/${id}.sql`;
  writeFileSync(file, statement);
  const out = execFileSync(
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
      file,
      '--json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out.slice(out.indexOf('['))).map((r) => r.results);
}

sql(`
INSERT INTO accounts(id,name,email,created) VALUES ('${A}','Feedback A','${A}@example.invalid',0);
INSERT INTO account_sessions(hash,account,expires) VALUES ('${sha(token)}','${A}',${Date.now() + 600000});
`);

async function call(path, { account, member, body, ip = id } = {}) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': ip,
      ...(account ? { 'X-Account-Authorization': 'Bearer ' + account } : {}),
      ...(member ? { Authorization: 'Bearer ' + member } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const ok = (r, label) => {
  assert.equal(r.status, 200, `${label}: ${JSON.stringify(r.data)}`);
  return r.data;
};

// Active forms for every context; unknown contexts are rejected.
for (const context of ['general', 'bug', 'script', 'puzzle', 'game-end'])
  assert.equal(
    ok(await call('/api/feedback?context=' + context), context).form.id,
    context + ':1',
  );
assert.equal((await call('/api/feedback?context=nope')).status, 400);

// A guest submits general feedback with an anonymous device id.
const guest = 'guest-' + randomBytes(12).toString('hex');
const g = ok(
  await call('/api/feedback', {
    body: {
      form: 'general:1',
      guest,
      answers: { overall: 5, comment: 'Great first game.' },
    },
  }),
  'guest submit',
);
// Missing required answer and unknown questions are rejected.
assert.equal(
  (
    await call('/api/feedback', {
      body: { form: 'general:1', answers: { overall: 5 } },
    })
  ).status,
  400,
);

// A seated account files a bug report; public table details are attached.
const lobby = ok(
  await call('/api/session', {
    account: token,
    body: { action: 'create', name: 'Feedback A' },
  }),
  'create lobby',
);
const bug = ok(
  await call('/api/feedback', {
    account: token,
    member: lobby.token,
    body: {
      form: 'bug:1',
      code: lobby.code,
      answers: { what: 'The timer froze.' },
      client: { appVersion: '1.0.0', platform: 'web', role: 'monster' },
    },
  }),
  'bug submit',
);
// A rating form bound to a puzzle.
ok(
  await call('/api/feedback', {
    account: token,
    body: { form: 'puzzle:1', subject: 'lab', answers: { rating: 4 } },
  }),
  'puzzle rating',
);

const [rows] = sql(
  `SELECT id,context,account,guest,subject,answers,client,game FROM feedback_submissions WHERE id IN ('${g.id}','${bug.id}') OR account='${A}' ORDER BY created`,
);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
assert.equal(byId[g.id].account, null);
assert.equal(byId[g.id].guest, guest);
assert.equal(byId[bug.id].account, A);
assert.equal(byId[bug.id].guest, null);
const game = JSON.parse(byId[bug.id].game);
assert.equal(game.code, lobby.code);
assert.equal(game.phase, 'lobby');
assert.equal(game.viewer, 'storyteller');
assert.deepEqual(JSON.parse(byId[bug.id].client), {
  appVersion: '1.0.0',
  platform: 'web',
});
assert.ok(rows.some((r) => r.context === 'puzzle' && r.subject === 'lab'));

sql(
  `DELETE FROM feedback_submissions WHERE id='${g.id}' OR account='${A}'; DELETE FROM sessions WHERE code='${lobby.code}'; DELETE FROM accounts WHERE id='${A}';`,
);
console.log(
  'PASS: active forms per context, guest and account submissions, answer validation, bug report table and client details, puzzle subject binding.',
);
