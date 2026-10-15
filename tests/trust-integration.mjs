// Local D1 + HTTP coverage for trust result recording, wallet UI data and rewind.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame, newPlayer } from '../lib/game/types.ts';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const prefix = 'trust-' + randomBytes(6).toString('hex');
const code = String(100000 + Math.floor(Math.random() * 900000));
const now = Date.now();
const accounts = Array.from({ length: 7 }, (_, i) => prefix + '-' + i);
const accountTokens = accounts.map(() => randomBytes(32).toString('base64url'));
const memberTokens = accounts.map(() => randomBytes(32).toString('base64url'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const game = newGame(code, 'Trust host');
game.phase = 'night';
game.night = 2;
game.gameStartedAt = now;
game.players = Array.from({ length: 6 }, (_, i) => ({
  ...newPlayer('Trust player ' + i, i + 1),
  role: i < 4 ? 'judge' : 'monster',
  shown: i < 4 ? 'judge' : 'monster',
}));
function sql(source) {
  mkdirSync('work', { recursive: true });
  const file = 'work/' + prefix + '.sql';
  writeFileSync(file, source);
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
      file,
    ],
    { stdio: 'pipe' },
  );
}
async function call(path, body, accountIndex = 0, memberIndex = null) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': prefix,
      ...(accountIndex === null
        ? {}
        : {
            'X-Account-Authorization': 'Bearer ' + accountTokens[accountIndex],
          }),
      ...(memberIndex === null
        ? {}
        : { Authorization: 'Bearer ' + memberTokens[memberIndex] }),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, 200, path + ': ' + JSON.stringify(data));
  return data;
}
async function act(payload) {
  const view = await call('/api/game', undefined, 0, 0);
  return call('/api/game', { ...payload, version: view.version }, 0, 0);
}
sql(`INSERT INTO accounts(id,name,email,created) VALUES ${accounts.map((id) => `(${quote(id)},'Trust player',${quote(id + '@example.invalid')},${now})`).join(',')};
  INSERT INTO account_sessions(hash,account,expires) VALUES ${accounts.map((id, i) => `(${quote(sha(accountTokens[i]))},${quote(id)},${now + 600000})`).join(',')};
  INSERT INTO sessions(code,state,created,version) VALUES (${quote(code)},${quote(JSON.stringify(game))},${now},0);
  INSERT INTO members(token_hash,code,player,host,expires) VALUES ${memberTokens.map((t, i) => `(${quote(sha(t))},${quote(code)},${quote(i === 0 ? 'host' : game.players[i - 1].id)},${i === 0 ? 1 : 0},${now + 600000})`).join(',')};
  INSERT INTO account_seats(id,account,code,player,host) VALUES ${accounts
    .slice(0, 6)
    .map(
      (id, i) =>
        `(${quote(prefix + '-seat-' + i)},${quote(id)},${quote(code)},${quote(i === 0 ? 'host' : game.players[i - 1].id)},${i === 0 ? 1 : 0})`,
    )
    .join(',')};`);
try {
  await act({ action: 'end', winner: 'good' });
  assert.equal((await call('/api/wallet')).balance, 20);
  assert.equal((await call('/api/wallet', undefined, 1)).balance, 30);
  assert.equal((await call('/api/wallet', undefined, 5)).balance, 20);
  for (let i = 0; i < 3; i++) await call('/api/game', undefined, 0, 0);
  assert.equal((await call('/api/wallet', undefined, 1)).entries.length, 2);
  const recordedGame = code + ':' + now;
  for (const [index, stars] of [
    [1, 5],
    [2, 4],
    [3, 3],
  ])
    await call(
      '/api/social',
      { action: 'rate', game: recordedGame, stars },
      index,
    );
  assert.equal((await call('/api/wallet')).balance, 35);
  await call(
    '/api/social',
    { action: 'rate', game: recordedGame, stars: 2 },
    1,
  );
  assert.equal((await call('/api/wallet')).balance, 25);
  const visibleWallet = JSON.stringify(await call('/api/wallet'));
  assert.ok(
    !visibleWallet.includes(accounts[1]) &&
      !visibleWallet.includes('rater') &&
      !visibleWallet.includes('idempotency'),
  );
  await call('/api/accounts', { action: 'attach' }, 6, 6);
  assert.equal((await call('/api/wallet', undefined, 6)).balance, 0);
  await act({ action: 'undo' });
  assert.equal((await call('/api/wallet')).balance, 0);
  assert.equal((await call('/api/wallet', undefined, 1)).balance, 0);
  await act({ action: 'end', winner: 'evil' });
  assert.equal((await call('/api/wallet', undefined, 1)).balance, 20);
  assert.equal((await call('/api/wallet', undefined, 5)).balance, 30);
  assert.equal((await call('/api/wallet', undefined, 6)).balance, 0);
  assert.equal(
    (
      await call(
        '/api/wallet?game=' + encodeURIComponent(code + ':' + now),
        undefined,
        1,
      )
    ).gameEarned,
    20,
  );
  console.log(
    'PASS trust: eligible finish/win, retries, late sign-in, rewind and re-end via HTTP',
  );
} finally {
  sql(
    `DELETE FROM games WHERE code=${quote(code)}; DELETE FROM sessions WHERE code=${quote(code)}; DELETE FROM accounts WHERE id IN (${accounts.map(quote).join(',')});`,
  );
}
