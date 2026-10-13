import test from 'node:test';
import assert from 'node:assert/strict';
import { successfulMainCI, productionCandidate } from '../scripts/deployment-policy.mjs';
void test('deployment requires successful main CI from this repository, with both real checks', () => {
  const run = { event: 'push', head_branch: 'main', head_sha: 'sha', head_repository: { full_name: 'owner/repo' }, conclusion: 'success' };
  const jobs = [{ name: 'check', conclusion: 'success' }, { name: 'integration', conclusion: 'success' }];
  assert.ok(successfulMainCI(run, jobs, 'owner/repo', 'sha'));
  assert.equal(successfulMainCI({ ...run, event: 'pull_request' }, jobs, 'owner/repo', 'sha'), false);
  assert.equal(successfulMainCI(run, [{ name: 'check', conclusion: 'skipped' }, jobs[1]], 'owner/repo', 'sha'), false);
  assert.equal(successfulMainCI(run, jobs, 'owner/repo', 'other-sha'), false);
});
void test('production promotion requires the exact healthy staging SHA and cutover readiness', () => {
  const health = { ok: true, environment: 'staging', build: 'sha', d1: 'ok', durableObject: 'ok' };
  assert.ok(productionCandidate(health, 'sha', 'true'));
  assert.equal(productionCandidate(health, 'different', 'true'), false);
  assert.equal(productionCandidate(health, 'sha', ''), false);
});
