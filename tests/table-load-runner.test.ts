import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetURL,
  optionsFromArgs,
  statistics,
} from '../scripts/load-table.mjs';
void test('load runner rejects production, deceptive hosts, credentials and redirectable paths', () => {
  assert.equal(
    targetURL('https://staging.fearville.app'),
    'https://staging.fearville.app',
  );
  assert.equal(targetURL('http://127.0.0.1:3001'), 'http://127.0.0.1:3001');
  for (const url of [
    'https://fearville.app',
    'https://staging.fearville.app.evil.test',
    'https://staging.fearville.app:444',
    'https://user:secret@staging.fearville.app',
    'https://staging.fearville.app/redirect',
    'https://staging.fearville.app?target=production',
    'file://localhost',
  ])
    assert.throws(() => targetURL(url));
  assert.throws(() =>
    optionsFromArgs([
      '--url',
      'https://staging.fearville.app',
      '--players',
      '19',
    ]),
  );
  assert.throws(() =>
    optionsFromArgs([
      '--url',
      'https://staging.fearville.app',
      '--tables',
      '6',
    ]),
  );
  assert.throws(() =>
    optionsFromArgs([
      '--url',
      'https://staging.fearville.app',
      '--cycles',
      '0',
    ]),
  );
});
void test('load report percentiles use nearest rank and never pretend missing measurements are zero', () => {
  assert.deepEqual(statistics([8, 1, 6, 3, 7, 5, 2, 4, 9, 10]), {
    p50: 5,
    p95: 10,
    p99: 10,
  });
  assert.deepEqual(statistics([]), { p50: null, p95: null, p99: null });
});
