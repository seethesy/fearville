// FEAR-196: shell detection, the client header, and the bundled error page.
import { expect, test } from '@playwright/test';
import { fakeShell, platformOf, expectNoHorizontalOverflow } from './support';

test('a plain browser stays a browser: no bridge, web client header', async ({
  page,
}) => {
  const clients: string[] = [];
  page.on('request', (r) => {
    const value = r.headers()['x-fearville-client'];
    if (value && new URL(r.url()).pathname.startsWith('/api/'))
      clients.push(value);
  });
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  expect(
    await page.evaluate(
      () => 'FearvilleNative' in window || 'Capacitor' in window,
    ),
  ).toBe(false);
  await expect.poll(() => clients.length).toBeGreaterThan(0);
  expect(clients.every((c) => c.startsWith('web/'))).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test('inside the shell the bridge is installed with the shell capabilities', async ({
  page,
  context,
}, info) => {
  const platform = platformOf(info);
  await fakeShell(context, platform);
  const clients: string[] = [];
  page.on('request', (r) => {
    const value = r.headers()['x-fearville-client'];
    if (value) clients.push(value);
  });
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              FearvilleNative?: { capabilities: string[] };
            }
          ).FearvilleNative?.capabilities
            .slice()
            .sort() ?? [],
      ),
    )
    .toEqual(['auth', 'haptics', 'keepAwake', 'lifecycle', 'share']);
  // No secure storage plugin in the shells (tokens stay in HttpOnly cookies).
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { FearvilleNative: { version: number } })
          .FearvilleNative.version,
    ),
  ).toBe(1);
  // Once the App plugin reports the build, requests identify the shell.
  await page.reload();
  await expect
    .poll(() => clients.some((c) => c === `${platform}/1.0.0/42/1`))
    .toBe(true);
});

test('offline error page renders the logo and font; Retry opens the site', async ({
  page,
}) => {
  const base = process.env.E2E_STATIC_URL!;
  // site.js points at the hosted site; don't actually leave the test.
  let opened = '';
  await page.route(/https:\/\/(staging\.)?fearville\.app\/.*/, (route) => {
    opened = route.request().url();
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<p>site</p>',
    });
  });
  await page.goto(base + '/error.html');
  const site = await page.evaluate(
    () => (window as unknown as { FEARVILLE_SITE: string }).FEARVILLE_SITE,
  );
  expect(site).toMatch(/^https:\/\/(staging\.)?fearville\.app\/$/);
  await expect(page.getByRole('heading', { name: 'Fearville' })).toBeVisible();
  expect(
    await page
      .locator('img.logo')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('16px "Metal Mania"');
      }),
    )
    .toBe(true);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => opened).toBe(site);
});
