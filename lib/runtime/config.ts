export type RuntimeEnvironment = 'local' | 'staging' | 'production';
export function runtimeEnvironment(
  values: Record<string, unknown>,
): RuntimeEnvironment {
  return values.ENVIRONMENT === 'staging'
    ? 'staging'
    : values.ENVIRONMENT === 'production'
      ? 'production'
      : 'local';
}
export function runtimeOrigin(values: Record<string, unknown>) {
  const environment = runtimeEnvironment(values);
  const expected =
    environment === 'staging'
      ? 'https://staging.fearville.app'
      : 'https://fearville.app';
  if (!values.APP_ORIGIN) return expected;
  if (values.APP_ORIGIN !== expected)
    throw Error('APP_ORIGIN does not match the configured environment.');
  return expected;
}
export function environmentHeaders(environment: RuntimeEnvironment) {
  return environment === 'staging'
    ? { 'X-Robots-Tag': 'noindex, nofollow, noarchive' }
    : {};
}
