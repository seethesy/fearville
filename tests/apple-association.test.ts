import test from 'node:test';
import assert from 'node:assert/strict';
import { appleAppSiteAssociation } from '../lib/mobile/apple-association.ts';

const endpoint = '/.well-known/apple-app-site-association';
for (const [host, appID] of [
  ['fearville.app', 'TV2PQGFFGU.app.fearville'],
  ['staging.fearville.app', 'TV2PQGFFGU.app.fearville.staging'],
]) {
  void test(`${host} associates only its own app with invitation routes`, async () => {
    const response = appleAppSiteAssociation(
      new Request(`https://${host}${endpoint}`),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    assert.equal(response.headers.get('Location'), null);
    const { applinks } = (await response.json()) as {
      applinks: {
        details: { appIDs: string[]; components: Record<string, unknown>[] }[];
      };
    };
    assert.equal(applinks.details.length, 1);
    assert.deepEqual(applinks.details[0].appIDs, [appID]);
    assert.deepEqual(
      applinks.details[0].components.map((component) => component['/']),
      ['/table', '/friends'],
    );
    assert.deepEqual(applinks.details[0].components[0]['?'], { code: '?*' });
  });
}

void test('association supports HEAD and rejects mutations and unrelated hosts', async () => {
  const head = appleAppSiteAssociation(
    new Request(`https://fearville.app${endpoint}`, { method: 'HEAD' }),
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('Content-Type'), 'application/json');
  const post = appleAppSiteAssociation(
    new Request(`https://fearville.app${endpoint}`, { method: 'POST' }),
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
  assert.equal(
    appleAppSiteAssociation(
      new Request(`https://fearville.app.evil.test${endpoint}`),
    ).status,
    404,
  );
});
