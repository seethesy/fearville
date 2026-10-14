import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_ACCOUNT,
  reviewAccountStatements,
  reviewCredentialsMatch,
  reviewLoginConfig,
} from '../lib/accounts/review-login.ts';

const password = 'correct-horse-battery-staple';
const values = (extra: Record<string, unknown> = {}) => ({
  ENVIRONMENT: 'staging',
  REVIEW_LOGIN_USERNAME: 'app-review',
  REVIEW_LOGIN_PASSWORD: password,
  ...extra,
});

void test('review sign-in is on only for staging with both secrets', () => {
  assert.deepEqual(reviewLoginConfig(values()), {
    username: 'app-review',
    password,
  });
  assert.equal(reviewLoginConfig(values({ ENVIRONMENT: 'production' })), null);
  assert.equal(reviewLoginConfig(values({ ENVIRONMENT: undefined })), null);
  assert.equal(reviewLoginConfig(values({ ENVIRONMENT: 'local' })), null);
  assert.equal(reviewLoginConfig(values({ REVIEW_LOGIN_USERNAME: '' })), null);
  assert.equal(
    reviewLoginConfig(values({ REVIEW_LOGIN_PASSWORD: undefined })),
    null,
  );
});

void test('short usernames and passwords keep the feature off', () => {
  assert.equal(
    reviewLoginConfig(values({ REVIEW_LOGIN_USERNAME: 'ab' })),
    null,
  );
  assert.equal(
    reviewLoginConfig(values({ REVIEW_LOGIN_PASSWORD: 'short-password' })),
    null,
  );
});

void test('only the exact username and password match', async () => {
  const config = reviewLoginConfig(values());
  assert.equal(
    await reviewCredentialsMatch(config, 'app-review', password),
    true,
  );
  assert.equal(
    await reviewCredentialsMatch(config, 'app-review', 'wrong'),
    false,
  );
  assert.equal(await reviewCredentialsMatch(config, 'other', password), false);
  assert.equal(await reviewCredentialsMatch(config, '', ''), false);
  assert.equal(
    await reviewCredentialsMatch(config, 'app-review', password + ' '),
    false,
  );
  assert.equal(
    await reviewCredentialsMatch(null, 'app-review', password),
    false,
  );
});

void test('the reviewer account is a non-admin synthetic account that can be recreated', () => {
  const sql = reviewAccountStatements(1).join('\n');
  assert.match(sql, new RegExp(`'${REVIEW_ACCOUNT}'`));
  assert.match(sql, /@example\.invalid/);
  assert.doesNotMatch(sql, /role/i);
  assert.equal((sql.match(/ON CONFLICT/g) || []).length, 3);
});
