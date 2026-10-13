import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeEnvironment, runtimeOrigin, environmentHeaders } from '../lib/runtime/config.ts';
void test('staging callbacks never fall back to the production origin', () => {
  assert.equal(runtimeOrigin({ ENVIRONMENT: 'staging' }), 'https://staging.fearville.app');
  assert.throws(() => runtimeOrigin({ ENVIRONMENT: 'staging', APP_ORIGIN: 'https://fearville.app' }));
  assert.equal(runtimeOrigin({ ENVIRONMENT: 'production' }), 'https://fearville.app');
  assert.equal(runtimeEnvironment({}), 'local');
});
void test('staging responses opt out of search indexing', () => {
  assert.match(environmentHeaders('staging')['X-Robots-Tag'] ?? '', /noindex/);
  assert.deepEqual(environmentHeaders('production'), {});
});
