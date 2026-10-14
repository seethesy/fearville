// App Review sign-in: lets Apple's TestFlight reviewer reach the account-only
// sandbox without a Google or Apple ID. Staging only; off unless both Worker
// secrets are set. Never available in production or local runs.
import { runtimeEnvironment } from '../runtime/config.ts';

export const REVIEW_ACCOUNT = 'review-signin';
export const REVIEW_HANDLE = 'app_reviewer';
export const REVIEW_PASSWORD_MIN = 16;

export type ReviewLoginConfig = { username: string; password: string };

const secret = (values: Record<string, unknown>, key: string) =>
  typeof values[key] === 'string' ? (values[key] as string).trim() : '';

/** The configured reviewer credentials, or null when the feature is off. */
export function reviewLoginConfig(
  values: Record<string, unknown>,
): ReviewLoginConfig | null {
  if (runtimeEnvironment(values) !== 'staging') return null;
  const username = secret(values, 'REVIEW_LOGIN_USERNAME');
  const password = secret(values, 'REVIEW_LOGIN_PASSWORD');
  if (username.length < 3 || password.length < REVIEW_PASSWORD_MIN) return null;
  return { username, password };
}

/** Compare through SHA-256 digests so timing does not reveal matching length or prefix. */
async function same(a: string, b: string) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const p = new Uint8Array(x),
    q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

export async function reviewCredentialsMatch(
  config: ReviewLoginConfig | null,
  username: string,
  password: string,
) {
  if (!config) return false;
  // Evaluate both so a wrong username takes as long as a wrong password.
  const [user, pass] = await Promise.all([
    same(username, config.username),
    same(password, config.password),
  ]);
  return user && pass;
}

/**
 * The synthetic, non-admin reviewer account. Idempotent, so it is recreated on
 * the next sign-in if a reviewer deletes it. The .invalid email can never
 * match the admin allowlist.
 */
export function reviewAccountStatements(now: number) {
  return [
    `INSERT INTO accounts(id,name,email,handle,created) VALUES ('${REVIEW_ACCOUNT}','App Reviewer','${REVIEW_ACCOUNT}@example.invalid','${REVIEW_HANDLE}',${now}) ON CONFLICT(id) DO NOTHING;`,
    `INSERT INTO account_profiles(account,lobby_name) VALUES ('${REVIEW_ACCOUNT}','App Reviewer') ON CONFLICT(account) DO NOTHING;`,
    `INSERT INTO account_settings(account) VALUES ('${REVIEW_ACCOUNT}') ON CONFLICT(account) DO NOTHING;`,
  ];
}
