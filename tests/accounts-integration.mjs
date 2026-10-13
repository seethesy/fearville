import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = process.env.CT_TEST_URL || 'http://localhost:3000'; // Fixtures are restricted to the local D1 database.
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const prefix = 'test-' + randomBytes(8).toString('hex'),
  a = prefix + '-a',
  b = prefix + '-b';
const tokenA = randomBytes(32).toString('base64url'),
  tokenB = randomBytes(32).toString('base64url');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const nativeCode = randomBytes(32).toString('base64url'),
  verifier = randomBytes(32).toString('base64url');
mkdirSync('work', { recursive: true });
writeFileSync(
  'work/account-fixture.sql',
  `INSERT INTO accounts(id,name,email,created) VALUES ('${a}','Test A','a@example.invalid',0),('${b}','Test B','b@example.invalid',0);
INSERT INTO account_sessions(hash,account,expires) VALUES ('${hash(tokenA)}','${a}',${Date.now() + 600000}),('${hash(tokenB)}','${b}',${Date.now() + 600000});
INSERT INTO identities(id,account,provider) VALUES ('google:${a}','${a}','google'),('google:${b}','${b}','google');
INSERT INTO native_codes(hash,account,challenge,expires) VALUES ('${hash(nativeCode)}','${a}','${createHash('sha256').update(verifier).digest('base64url')}',${Date.now() + 60000});`,
);
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
    'work/account-fixture.sql',
  ],
  { stdio: 'pipe' },
);
async function call(path, account = '', body, member = '') {
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
  return {
    status: response.status,
    cookie: response.headers.get('set-cookie') || '',
    data: await json(response, path),
  };
}
const guest = await call('/api/accounts');
assert.equal(guest.status, 200);
assert.equal(guest.data.account, null);
assert.deepEqual(guest.data.providers, { google: false, apple: false });
assert.equal(
  (await call('/api/accounts/start', '', { provider: 'google' })).status,
  503,
);
assert.equal(
  (await call('/api/accounts/start', '', { provider: 'unknown' })).status,
  400,
);
assert.equal(
  (await call('/api/accounts', '', { action: 'resume', seat: 'not-owned' }))
    .status,
  401,
);
const started = await call('/api/session', tokenA, {
  action: 'create',
  name: 'Account test host',
});
assert.equal(started.status, 200);
const member = started.data.token;
const own = await call('/api/accounts', tokenA);
assert.equal(own.data.seats.length, 1);
const seat = own.data.seats[0];
assert.equal(
  (await call('/api/accounts', tokenB, { action: 'resume', seat: seat.id }))
    .status,
  400,
);
const resumed = await call('/api/accounts', tokenA, {
  action: 'resume',
  seat: seat.id,
});
assert.equal(resumed.status, 200);
assert.equal(resumed.data.code, started.data.code);
await call('/api/accounts', tokenB, { action: 'attach' }, member);
assert.equal((await call('/api/accounts', tokenB)).data.seats.length, 0);
assert.equal(
  (
    await call('/api/accounts/exchange', '', {
      code: nativeCode,
      verifier: 'wrong',
    })
  ).status,
  400,
);
const exchanged = await call('/api/accounts/exchange', '', {
  code: nativeCode,
  verifier,
});
assert.equal(exchanged.status, 200);
const tokenA2 = exchanged.data.accountToken;
assert.match(exchanged.cookie, /ct_account=[^;]+; HttpOnly; Secure/);
assert.equal(
  (await call('/api/accounts/exchange', '', { code: nativeCode, verifier }))
    .status,
  400,
);
assert.equal((await call('/api/accounts', tokenA2)).data.account.id, a);
assert.equal(
  (await call('/api/accounts', tokenA2)).data.profile.settings.showTips,
  true,
);
assert.equal(
  (await call('/api/accounts', tokenA2, { action: 'roleTips', enabled: false }))
    .status,
  200,
);
assert.equal(
  (await call('/api/accounts', tokenA)).data.profile.settings.showTips,
  false,
  'tips preference is shared by account sessions',
);
assert.equal(
  (await call('/api/accounts', tokenA, { action: 'roleTips', enabled: true }))
    .status,
  200,
);
assert.equal(
  (await call('/api/accounts', tokenA2)).data.profile.settings.showTips,
  true,
);
assert.equal(
  (await call('/api/accounts', tokenA, { action: 'signout' }, member)).status,
  200,
);
assert.equal((await call('/api/accounts', tokenA)).data.account, null);
assert.equal((await call('/api/game', '', undefined, member)).status, 401);
assert.equal(
  (await call('/api/accounts', tokenA2, { action: 'delete', confirm: 'wrong' }))
    .status,
  400,
);
assert.equal(
  (
    await call('/api/accounts', tokenA2, {
      action: 'delete',
      confirm: 'DELETE',
    })
  ).status,
  200,
);
assert.equal((await call('/api/accounts', tokenA2)).data.account, null);
assert.equal(
  (await call('/api/game', '', undefined, resumed.data.token)).status,
  401,
);
assert.equal((await call('/api/accounts', tokenB)).data.account.id, b);
await call('/api/accounts', tokenB, { action: 'delete', confirm: 'DELETE' });
console.log(
  'PASS: provider-unavailable states, account scoping, saved seat restoration, claim protection, single-use native exchange, logout, and deletion. Real Google/Apple credentials were not used.',
);

async function json(response, path) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw Error(path + ' returned ' + response.status + ': ' + text);
  }
}
