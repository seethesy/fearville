// Existing game-flow tests now create lobbies with a local account, as the UI does.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
let credential;
const id = 'host-fixture-' + randomBytes(8).toString('hex');
const rooms = new Set();
function sql(statement) {
  mkdirSync('work', { recursive: true });
  const file = `work/${id}-fixture.sql`;
  writeFileSync(file, statement);
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
      file,
    ],
    { stdio: 'pipe' },
  );
}
export async function hostFixtureFetch(url, options = {}) {
  assert.ok(
    ['localhost', '127.0.0.1'].includes(new URL(url).hostname),
    'Fixtures are local-only.',
  );
  const body = options.body ? JSON.parse(options.body) : {};
  const headers = new Headers(options.headers);
  if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', id);
  if (
    new URL(url).pathname === '/api/session' &&
    ['create', 'createSandbox'].includes(body.action) &&
    !headers.has('X-Account-Authorization')
  ) {
    if (!credential) {
      credential = randomBytes(32).toString('base64url');
      sql(
        `INSERT INTO accounts(id,name,email,created) VALUES ('${id}','Test storyteller','${id}@example.invalid',0); INSERT INTO account_sessions(hash,account,expires) VALUES ('${createHash('sha256').update(credential).digest('hex')}','${id}',${Date.now() + 3600000});`,
      );
      process.on('exit', () => {
        try {
          sql(
            [...rooms]
              .map(
                (code) =>
                  `DELETE FROM games WHERE code='${code}'; DELETE FROM sessions WHERE code='${code}';`,
              )
              .join('\n') + `DELETE FROM accounts WHERE id='${id}';`,
          );
        } catch {
          /* Preserve the test failure if cleanup is unavailable. */
        }
      });
    }
    headers.set('X-Account-Authorization', 'Bearer ' + credential);
    headers.set('cf-connecting-ip', id);
  }
  const response = await fetch(url, { ...options, headers });
  if (
    new URL(url).pathname === '/api/session' &&
    ['create', 'createSandbox'].includes(body.action) &&
    response.ok
  )
    rooms.add((await response.clone().json()).code);
  return response;
}
