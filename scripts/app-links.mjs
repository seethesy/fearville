// FEAR-197: what a correct Universal Links association response looks like.
// Shared by tests/app-links-integration.mjs (compiled Worker) and
// scripts/deploy-smoke.mjs (live host after each deploy). Apple caches a bad
// file, so the check is strict: 200, application/json, no redirect, the
// right app ID for the host, and only invite paths associated.
export const ASSOCIATION_PATH = '/.well-known/apple-app-site-association';
export const APP_IDS = {
  'fearville.app': 'TV2PQGFFGU.app.fearville',
  'staging.fearville.app': 'TV2PQGFFGU.app.fearville.staging',
};
// Paths that must open in the app vs. ones that must stay in the browser.
export const ASSOCIATED = ['/table', '/friends'];
export const NOT_ASSOCIATED = ['/privacy', '/store'];

/** Returns a list of problems (empty when the response is correct). */
export function associationProblems(
  { status, contentType, location, body },
  expectedAppId,
) {
  const problems = [];
  if (status !== 200) problems.push(`status ${status}, expected 200`);
  if (location) problems.push(`redirects to ${location}`);
  if (!/^application\/json\b/.test(contentType ?? ''))
    problems.push(`content-type ${contentType}, expected application/json`);
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    problems.push('body is not JSON');
    return problems;
  }
  const details = json?.applinks?.details;
  if (!Array.isArray(details) || details.length !== 1) {
    problems.push('expected exactly one applinks.details entry');
    return problems;
  }
  const [detail] = details;
  if (JSON.stringify(detail.appIDs) !== JSON.stringify([expectedAppId]))
    problems.push(
      `appIDs ${JSON.stringify(detail.appIDs)}, expected ["${expectedAppId}"]`,
    );
  const paths = (detail.components ?? []).map((c) => c['/']);
  for (const path of ASSOCIATED)
    if (!paths.includes(path)) problems.push(`${path} is not associated`);
  for (const path of NOT_ASSOCIATED)
    if (paths.some((p) => p === path || p === '*' || path.startsWith(p + '/')))
      problems.push(`${path} must not be associated`);
  // FEAR-95 (Android): add the /.well-known/assetlinks.json check here and
  // its expected package/fingerprint per host once the Android shell lands.
  return problems;
}

/** Fetch without following redirects and collect the fields checked above. */
export async function fetchAssociation(fetcher, url) {
  const response = await fetcher(url, { redirect: 'manual' });
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    location: response.headers.get('location'),
    body: await response.text(),
  };
}
