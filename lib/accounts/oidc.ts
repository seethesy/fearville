import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  importPKCS8,
  CompactEncrypt,
  compactDecrypt,
  base64url,
  type JWTVerifyGetKey,
} from 'jose';
export type Provider = 'google' | 'apple';
export function providerName(value: unknown): Provider {
  if (value !== 'google' && value !== 'apple')
    throw Error('Choose Google or Apple.');
  return value;
}
const keysets = {
  google: createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs'),
  ),
  apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
};
export async function validateIdentity(
  token: string,
  provider: Provider,
  audience: string,
  nonce: string,
  keys: JWTVerifyGetKey = keysets[provider],
) {
  const { payload } = await jwtVerify(token, keys, {
    issuer:
      provider === 'google'
        ? ['https://accounts.google.com', 'accounts.google.com']
        : 'https://appleid.apple.com',
    audience,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
    maxTokenAge: '10m',
    clockTolerance: 15,
  });
  if (payload.nonce !== nonce || !payload.sub)
    throw Error('The sign-in response did not match this request.');
  if (
    payload.email &&
    payload.email_verified !== true &&
    payload.email_verified !== 'true'
  )
    throw Error('Your provider has not verified this email.');
  return {
    verified:
      payload.email_verified === true || payload.email_verified === 'true',
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : '',
  };
}
export async function appleSecret(
  client: string,
  team: string,
  keyID: string,
  pem: string,
) {
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyID })
    .setIssuer(team)
    .setSubject(client)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}
export async function encryptToken(token: string, key: string) {
  return new CompactEncrypt(new TextEncoder().encode(token))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(base64url.decode(key));
}
export async function decryptToken(token: string, key: string) {
  const { plaintext } = await compactDecrypt(token, base64url.decode(key));
  return new TextDecoder().decode(plaintext);
}
export async function challenge(value: string) {
  return base64url.encode(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  );
}
export function random() {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}
