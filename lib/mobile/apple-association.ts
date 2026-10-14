// iOS 17+ Universal Links. Keep these registered identities in sync with
// mobile/ios/App/Config/Identity.xcconfig (FEAR-115).
const apps: Record<string, string> = {
  'fearville.app': 'TV2PQGFFGU.app.fearville',
  'staging.fearville.app': 'TV2PQGFFGU.app.fearville.staging',
};

export function appleAppSiteAssociation(request: Request): Response {
  const host = new URL(request.url).hostname;
  const appID = Object.hasOwn(apps, host) ? apps[host] : undefined;
  if (!appID) return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const body = {
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: [
            {
              '/': '/table',
              '?': { code: '?*' },
              comment: 'Table invitations',
            },
            {
              '/': '/friends',
              comment: 'Friend requests and game invitations',
            },
          ],
        },
      ],
    },
  };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
