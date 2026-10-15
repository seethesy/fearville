// FEAR-196 helpers: a fake Capacitor shell, local D1 fixtures and table setup.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

export type Platform = 'ios' | 'android';
export const platformOf = (info: TestInfo): Platform =>
  info.project.name.startsWith('iphone') ? 'ios' : 'android';
export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const id = (prefix: string) =>
  `${prefix}-${randomBytes(6).toString('hex')}`;

/**
 * Installs window.Capacitor before any page script runs. Plugins record every
 * call in window.__native.calls; listeners land in window.__native.listeners.
 * iOS offers FearvilleAuth (resolved by finishAuth), Android Browser + App
 * appUrlOpen. SecureStoragePlugin is absent, as in the real shells.
 */
export async function fakeShell(context: BrowserContext, platform: Platform) {
  await context.addInitScript((platform: string) => {
    type Listener = (data: Record<string, unknown>) => void;
    const state = {
      platform,
      calls: [] as [string, unknown][],
      listeners: {} as Record<string, Listener>,
      resolveAuth: null as null | ((value: unknown) => void),
    };
    (window as unknown as Record<string, unknown>).__native = state;
    const record =
      (name: string, result?: unknown) => async (args?: unknown) => {
        state.calls.push([name, args ?? null]);
        return result;
      };
    const listen = (plugin: string) => (event: string, handler: Listener) => {
      state.listeners[plugin + '.' + event] = handler;
      return { remove: async () => {} };
    };
    const plugins: Record<string, Record<string, unknown>> = {
      Haptics: {
        impact: record('Haptics.impact'),
        notification: record('Haptics.notification'),
      },
      Share: { share: record('Share.share') },
      KeepAwake: {
        keepAwake: record('KeepAwake.keepAwake'),
        allowSleep: record('KeepAwake.allowSleep'),
      },
      App: {
        getInfo: async () => ({ version: '1.0.0', build: '42' }),
        addListener: listen('App'),
      },
      Network: { addListener: listen('Network') },
    };
    if (platform === 'ios')
      plugins.FearvilleAuth = {
        start: (args: unknown) => {
          state.calls.push(['FearvilleAuth.start', args]);
          return new Promise((resolve) => (state.resolveAuth = resolve));
        },
      };
    else
      plugins.Browser = {
        open: record('Browser.open'),
        close: record('Browser.close'),
      };
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      isPluginAvailable: (name: string) => name in plugins,
      Plugins: plugins,
    };
  }, platform);
}

export function nativeCalls(page: Page, prefix = '') {
  return page.evaluate(
    (prefix) =>
      (
        (window as unknown as { __native: { calls: [string, unknown][] } })
          .__native?.calls ?? []
      ).filter(([name]) => name.startsWith(prefix)),
    prefix,
  );
}
export async function expectNativeCall(
  page: Page,
  name: string,
  match: (args: unknown) => boolean = () => true,
) {
  await expect
    .poll(async () =>
      (await nativeCalls(page, name)).some(([, args]) => match(args)),
    )
    .toBe(true);
}
/** Fire a fake native listener (App.appStateChange, App.appUrlOpen, …). */
export function fireNative(
  page: Page,
  listener: string,
  data: Record<string, unknown>,
) {
  return page.evaluate(
    ([listener, data]) =>
      (
        window as unknown as {
          __native: {
            listeners: Record<string, (d: Record<string, unknown>) => void>;
          };
        }
      ).__native.listeners[listener as string](data as Record<string, unknown>),
    [listener, data] as const,
  );
}
/** Complete the shell's sign-in sheet with a callback URL. */
export async function finishSignin(
  page: Page,
  platform: Platform,
  url: string,
) {
  if (platform === 'ios') {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(window as unknown as { __native: { resolveAuth: unknown } })
              .__native.resolveAuth,
        ),
      )
      .toBe(true);
    await page.evaluate(
      (url) =>
        (
          window as unknown as {
            __native: { resolveAuth: (v: unknown) => void };
          }
        ).__native.resolveAuth({ url }),
      url,
    );
  } else {
    await expectNativeCall(page, 'Browser.open');
    await fireNative(page, 'App.appUrlOpen', { url });
  }
}

/** Run SQL against the e2e server's local D1 (same as host-fixture.mjs). */
export function sql(statement: string) {
  const persist = process.env.E2E_PERSIST;
  if (!persist) throw Error('Run through scripts/run-e2e.mjs.');
  mkdirSync('work', { recursive: true });
  const file = `work/e2e-${randomBytes(6).toString('hex')}.sql`;
  writeFileSync(file, statement);
  execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'site-creator-d1',
      '--local',
      '--persist-to',
      persist,
      '--config',
      'wrangler.local.json',
      '--file',
      file,
    ],
    { stdio: 'pipe' },
  );
}
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** An account (no session). */
export function createAccount(name = 'E2E Player') {
  const account = id('e2e');
  sql(
    `INSERT INTO accounts(id,name,email,created) VALUES (${q(account)},${q(name)},${q(account + '@example.invalid')},${Date.now()});`,
  );
  return account;
}
/** An account signed in on this context through the ct_account cookie. */
export async function signedIn(context: BrowserContext, name = 'E2E Host') {
  const account = createAccount(name);
  const token = randomBytes(32).toString('base64url');
  sql(
    `INSERT INTO account_sessions(hash,account,expires,provider,verified_email,issued) VALUES ('${sha(token)}',${q(account)},${Date.now() + 3600000},'google','',${Date.now()});`,
  );
  const url = new URL(process.env.E2E_BASE_URL!);
  await context.addCookies([
    {
      name: 'ct_account',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return account;
}

export async function ok(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
) {
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}
/**
 * A seat token client (guests or extra players). Use a fresh request context
 * per seat: contexts keep cookies, and a seat cookie outranks the token.
 */
export function seat(request: APIRequestContext, token: string) {
  const headers = { Authorization: 'Bearer ' + token };
  return {
    get: async () => ok(await request.get('/api/game', { headers })),
    post: async (data: Record<string, unknown>) =>
      ok(await request.post('/api/game', { headers, data })),
  };
}

/** Skip any tutorial popups (guests see them every time). */
export async function dismissTutorials(page: Page) {
  for (let i = 0; i < 12; i++) {
    const skip = page
      .getByRole('button', { name: /^(skip|skip tutorial|not now|close)$/i })
      .first();
    if (!(await skip.isVisible().catch(() => false))) {
      await page.waitForTimeout(300);
      if (!(await skip.isVisible().catch(() => false))) return;
    }
    await skip.click().catch(() => {});
  }
}

/** No horizontal page scroll. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}
/** Some stylesheet rule applying to the page shell pads with safe-area insets. */
export async function expectSafeAreaPadding(page: Page) {
  const applied = await page.evaluate(() => {
    const hits: string[] = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules)
          visit((rule as CSSGroupingRule).cssRules);
        const style = (rule as CSSStyleRule).style;
        const selector = (rule as CSSStyleRule).selectorText;
        if (!style || !selector) continue;
        const text = style.cssText;
        if (
          !/safe-area-inset/.test(text) ||
          !/padding|inset|top|bottom/.test(text)
        )
          continue;
        try {
          const el = document.querySelector(selector);
          if (el && el.getBoundingClientRect().height > 0) hits.push(selector);
        } catch {
          /* selectors the engine can't query */
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets))
      try {
        visit(sheet.cssRules);
      } catch {
        /* cross-origin sheet */
      }
    return hits;
  });
  expect(
    applied.length,
    'no visible element pads with safe-area insets',
  ).toBeGreaterThan(0);
}
