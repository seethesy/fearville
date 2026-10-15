// FEAR-196: native sign-in in shell mode. The fake auth plugin returns a
// fearville://signin?code= callback; the page exchanges it, the ct_account
// cookie is set, and the account survives a reload.
import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import {
  createAccount,
  dismissTutorials,
  fakeShell,
  finishSignin,
  platformOf,
  sha,
  sql,
} from './support';

test('native sign-in exchanges the callback code and stays signed in', async ({
  page,
  context,
}, info) => {
  const platform = platformOf(info);
  await fakeShell(context, platform);
  const account = createAccount('Shell Signin');
  let challenge = '';
  page.on('request', (r) => {
    if (r.url().endsWith('/api/accounts/start') && r.method() === 'POST')
      challenge =
        (r.postDataJSON() as { nativeChallenge?: string }).nativeChallenge ??
        '';
  });
  await page.goto('/account');
  await dismissTutorials(page);
  await page
    .getByRole('button', { name: 'Continue with Google' })
    .first()
    .click();
  await expect.poll(() => challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  // What the provider callback would have stored for this challenge.
  const code = randomBytes(24).toString('base64url');
  sql(
    `INSERT INTO native_codes(hash,account,challenge,expires,provider,verified_email) VALUES ('${sha(code)}','${account}','${challenge}',${Date.now() + 60000},'google','');`,
  );
  // The page never navigated to the provider: the shell's sheet owns it.
  expect(new URL(page.url()).pathname).toBe('/account');
  await finishSignin(page, platform, `fearville://signin?code=${code}`);
  await expect
    .poll(async () =>
      (await context.cookies()).some(
        (c) => c.name === 'ct_account' && c.httpOnly,
      ),
    )
    .toBe(true);
  await page.waitForLoadState('load');
  await page.reload();
  const me = await page.evaluate(
    async () =>
      (await (await fetch('/api/accounts')).json()) as {
        account?: { id: string } | null;
      },
  );
  expect(me.account?.id).toBe(account);
  await expect(page.getByText(/your account/i).first()).toBeVisible();
});

test('a lookalike callback signs nobody in', async ({
  page,
  context,
}, info) => {
  const platform = platformOf(info);
  await fakeShell(context, platform);
  await page.goto('/account');
  await dismissTutorials(page);
  await page
    .getByRole('button', { name: 'Continue with Google' })
    .first()
    .click();
  await finishSignin(page, platform, 'fearville://signin.evil?code=nope');
  await page.waitForTimeout(1000);
  expect((await context.cookies()).some((c) => c.name === 'ct_account')).toBe(
    false,
  );
});
