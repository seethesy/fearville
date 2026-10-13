import assert from 'node:assert/strict';
const base = process.env.CT_TEST_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const response = await fetch(base + '/api/health');
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'no-store');
const health = await response.json();
assert.deepEqual(
  Object.keys(health).sort(),
  ['ok', 'build', 'environment', 'd1', 'durableObject'].sort(),
);
assert.equal(health.ok, true);
assert.equal(health.d1, 'ok');
assert.equal(health.environment, 'local');
console.log(
  'PASS: health returns build/environment and infrastructure status without private data.',
);
