import { randomBytes, createHash } from 'node:crypto';
import { remoteQuery } from './remote-database.mjs';
const environment = process.env.DEPLOY_ENVIRONMENT;
const sha = process.env.DEPLOY_SHA;
if (!['staging', 'production'].includes(environment) || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw Error('Validated deployment inputs are required.');
const base = environment === 'staging' ? 'https://staging.fearville.app' : 'https://fearville.app';
let healthy = false;
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
    const health = await response.json();
    if (response.ok && health.ok && health.build === sha && health.environment === environment && health.d1 === 'ok' && health.durableObject === 'ok') { healthy = true; break; }
  } catch { /* Retry propagation. */ }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!healthy) throw Error('Health check did not reach the expected deployed SHA and environment.');
const prefix = 'release-smoke-' + randomBytes(8).toString('hex');
const accounts = [prefix + '-host', prefix + '-player'];
const tokens = accounts.map(() => randomBytes(32).toString('base64url'));
const hashes = tokens.map((token) => createHash('sha256').update(token).digest('hex'));
const expires = Date.now() + 300000;
async function call(account, body) {
  const response = await fetch(base + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Account-Authorization': 'Bearer ' + tokens[account], Origin: base }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`Sandbox smoke step failed with HTTP ${response.status}.`);
  return response.json();
}
try {
  for (let i = 0; i < 2; i++) {
    await remoteQuery(environment, 'INSERT INTO accounts(id,name,email,created) VALUES (?,?,?,?)', [accounts[i], 'Release smoke test', accounts[i] + '@example.invalid', Date.now()]);
    await remoteQuery(environment, 'INSERT INTO account_sessions(hash,account,expires) VALUES (?,?,?)', [hashes[i], accounts[i], expires]);
  }
  const room = await call(0, { action: 'createSandbox', name: 'Release smoke host' });
  if (!/^[A-Z0-9]{6}$/.test(room.code ?? '')) throw Error('Sandbox smoke did not return a table code.');
  await call(1, { action: 'join', code: room.code, name: 'Release smoke player' });
  console.log(`PASS: ${environment} health and sandbox create/join for ${sha}.`);
} finally {
  await remoteQuery(environment, 'DELETE FROM sessions WHERE code IN (SELECT code FROM account_seats WHERE account IN (?,?) AND host=1)', accounts);
  await remoteQuery(environment, 'DELETE FROM accounts WHERE id IN (?,?)', accounts);
}
