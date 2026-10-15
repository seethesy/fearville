// FEAR-195: the Capacitor adapter (lib/native/capacitor.ts) with a fake
// window.Capacitor, plus a contract test keeping capacitor.ts, the iOS bundle
// check and mobile/package.json in agreement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  installCapacitorBridge,
  signinCallback,
} from '../lib/native/capacitor.ts';

type Handler = (data: Record<string, unknown>) => void;
type Native = {
  version: number;
  capabilities: string[];
  app?: { platform: string; version: string; build: string };
  call(method: string, args?: Record<string, unknown>): Promise<unknown>;
};
const g = globalThis as Record<string, unknown>;
const original = g.window;
function setWindow(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    value,
    configurable: true,
    writable: true,
  });
}
test.afterEach(() => setWindow(original));

/** A fake shell: plugins record calls; listeners can be fired by tests. */
function shell(
  available: string[],
  {
    native = true,
    platform = 'ios',
    authResult = { url: 'fearville://signin?code=abc' } as Record<
      string,
      unknown
    >,
  } = {},
) {
  const calls: [string, unknown][] = [];
  const listeners: Record<string, Handler> = {};
  const events: Record<string, unknown>[] = [];
  const record = (name: string, result?: unknown) => async (args: unknown) => {
    calls.push([name, args]);
    return result;
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
    SecureStoragePlugin: {
      get: record('Secure.get', { value: 'stored' }),
      set: record('Secure.set'),
      remove: record('Secure.remove'),
    },
    App: {
      getInfo: async () => ({ version: '1.4.0', build: '57' }),
      addListener: (event: string, handler: Handler) => {
        listeners['App.' + event] = handler;
      },
    },
    Network: {
      addListener: (event: string, handler: Handler) => {
        listeners['Network.' + event] = handler;
      },
    },
    Browser: { open: record('Browser.open'), close: record('Browser.close') },
    FearvilleAuth: { start: record('FearvilleAuth.start', authResult) },
  };
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  win.Capacitor = {
    isNativePlatform: () => native,
    getPlatform: () => platform,
    isPluginAvailable: (name: string) => available.includes(name),
    Plugins: plugins,
  };
  win.addEventListener('fearville:native', (e) =>
    events.push((e as CustomEvent<Record<string, unknown>>).detail),
  );
  setWindow(win);
  return {
    win,
    calls,
    listeners,
    events,
    native: () => win.FearvilleNative as Native | undefined,
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const ALL = [
  'Haptics',
  'Share',
  'KeepAwake',
  'SecureStoragePlugin',
  'App',
  'Network',
  'Browser',
  'FearvilleAuth',
];

void test('inert in a browser and idempotent in a shell', () => {
  setWindow(new EventTarget());
  assert.doesNotThrow(installCapacitorBridge);
  assert.equal(
    (g.window as Record<string, unknown>).FearvilleNative,
    undefined,
  );

  const web = shell(ALL, { native: false });
  installCapacitorBridge();
  assert.equal(web.native(), undefined);

  const s = shell(ALL);
  const existing = { version: 99, capabilities: [], call: async () => null };
  s.win.FearvilleNative = existing;
  installCapacitorBridge();
  assert.equal(s.win.FearvilleNative, existing);
});

void test('capabilities reflect only the plugins the shell reports', async () => {
  const s = shell(['Haptics', 'App']);
  installCapacitorBridge();
  assert.deepEqual(s.native()!.capabilities.sort(), ['haptics', 'lifecycle']);
  await s.native()!.call('haptics.play', { kind: 'error' });
  await s.native()!.call('haptics.play', { kind: 'tap' });
  assert.deepEqual(
    s.calls.map(([name]) => name),
    ['Haptics.notification', 'Haptics.impact'],
  );
  // Unknown methods and missing plugins reject cleanly.
  await assert.rejects(
    s.native()!.call('share.open', {}),
    /Unknown native method/,
  );
  await assert.rejects(s.native()!.call('nope'), /Unknown native method/);

  const full = shell(ALL);
  installCapacitorBridge();
  assert.deepEqual(full.native()!.capabilities.sort(), [
    'auth',
    'haptics',
    'keepAwake',
    'lifecycle',
    'secureStorage',
    'share',
  ]);
  await full.native()!.call('keepAwake.set', { on: true });
  await full.native()!.call('keepAwake.set', { on: false });
  assert.equal(
    await full.native()!.call('share.open', { title: 'T', url: 'u' }),
    true,
  );
  assert.equal(
    await full.native()!.call('secureStorage.get', { key: 'account' }),
    'stored',
  );
  assert.deepEqual(
    full.calls.map(([name]) => name),
    [
      'KeepAwake.keepAwake',
      'KeepAwake.allowSleep',
      'Share.share',
      'Secure.get',
    ],
  );
  // The installed app is reported for X-Fearville-Client (FEAR-120).
  await flush();
  assert.deepEqual(full.native()!.app, {
    platform: 'ios',
    version: '1.4.0',
    build: '57',
  });
});

void test('iOS sign-in: FearvilleAuth result emits signin only for a valid callback', async () => {
  const ok = shell(ALL);
  installCapacitorBridge();
  assert.equal(
    await ok
      .native()!
      .call('auth.open', { url: 'https://fearville.app/api/accounts/start' }),
    true,
  );
  assert.deepEqual(ok.calls[0], [
    'FearvilleAuth.start',
    { url: 'https://fearville.app/api/accounts/start' },
  ]);
  assert.deepEqual(
    ok.events.filter((e) => e.type === 'signin'),
    [{ type: 'signin', code: 'abc', error: null }],
  );

  for (const authResult of [
    { cancelled: true },
    { url: 'fearville://signin.evil?code=abc' },
    { url: 'fearville://signin/wrong?code=abc' },
    { url: 'fearville://user@signin?code=abc' },
    { url: 'https://signin?code=abc' },
  ]) {
    const s = shell(ALL, { authResult });
    installCapacitorBridge();
    await s.native()!.call('auth.open', { url: 'https://fearville.app/x' });
    assert.deepEqual(
      s.events.filter((e) => e.type === 'signin'),
      [],
      JSON.stringify(authResult),
    );
  }
});

void test('Android sign-in: Custom Tabs plus appUrlOpen; lookalikes emit nothing', async () => {
  const s = shell(['App', 'Browser', 'Network'], { platform: 'android' });
  installCapacitorBridge();
  assert.ok(s.native()!.capabilities.includes('auth'));
  await s.native()!.call('auth.open', { url: 'https://fearville.app/start' });
  assert.deepEqual(s.calls[0], [
    'Browser.open',
    { url: 'https://fearville.app/start' },
  ]);
  const open = s.listeners['App.appUrlOpen'];
  for (const url of [
    'fearville://signin.evil?code=abc',
    'fearville://signin/wrong?code=abc',
    'fearville://user@signin?code=abc',
    'fearville://other?code=abc',
    'fearville://signin',
  ])
    open({ url });
  assert.deepEqual(
    s.events.filter((e) => e.type === 'signin'),
    [],
  );
  assert.ok(!s.calls.some(([name]) => name === 'Browser.close'));
  open({ url: 'fearville://signin?code=xyz' });
  open({ url: 'fearville://signin?error=denied' });
  await flush();
  assert.deepEqual(
    s.events.filter((e) => e.type === 'signin'),
    [
      { type: 'signin', code: 'xyz', error: null },
      { type: 'signin', code: null, error: 'denied' },
    ],
  );
  assert.equal(s.calls.filter(([name]) => name === 'Browser.close').length, 2);
});

void test('app state and network changes are re-emitted as lifecycle events', () => {
  const s = shell(['App', 'Network']);
  installCapacitorBridge();
  s.listeners['App.appStateChange']({ isActive: false });
  s.listeners['App.appStateChange']({ isActive: true });
  s.listeners['Network.networkStatusChange']({ connected: false });
  s.listeners['Network.networkStatusChange']({ connected: true });
  assert.deepEqual(
    s.events.filter((e) => e.type === 'lifecycle').map((e) => e.state),
    ['pause', 'resume', 'offline', 'online'],
  );
});

void test('sign-in callbacks follow the shared URL policy', () => {
  const cases: { url: string; expected: boolean }[] = [
    { url: 'fearville://signin?code=test', expected: true },
    { url: 'fearville://signin/?code=test', expected: true },
    { url: 'fearville://signin?error=denied', expected: true },
    { url: 'fearville://signin', expected: false },
    { url: 'fearville://signin.evil?code=test', expected: false },
    { url: 'https://signin?code=test', expected: false },
    { url: 'fearville://signin/wrong', expected: false },
    { url: 'fearville://user@signin?code=test', expected: false },
    { url: 'fearville://signin:99?code=test', expected: false },
    { url: 'not a url', expected: false },
  ];
  // FEAR-194's shared fixture, when present, holds the iOS/Android cases.
  const shared = 'mobile/tests/url-policy-cases.json';
  if (existsSync(shared))
    for (const c of (
      JSON.parse(readFileSync(shared, 'utf8')) as {
        cases: { kind: string; url: string; expected: boolean }[];
      }
    ).cases)
      if (c.kind === 'authCallback') cases.push(c);
  for (const c of cases)
    assert.equal(!!signinCallback(c.url), c.expected, c.url);
});

// ── Contract: capacitor.ts ↔ mobile/tests/ios-bundle.mjs ↔ mobile/package.json
// Each Capacitor plugin the adapter uses, with its npm package and the iOS
// class name the bundle check asserts. null = deliberately absent (reason).
const CONTRACT: Record<
  string,
  { package: string | null; iosClass: string | null; why?: string }
> = {
  Haptics: { package: '@capacitor/haptics', iosClass: 'HapticsPlugin' },
  Share: { package: '@capacitor/share', iosClass: 'SharePlugin' },
  KeepAwake: {
    package: '@capacitor-community/keep-awake',
    iosClass: 'KeepAwakePlugin',
  },
  App: { package: '@capacitor/app', iosClass: 'AppPlugin' },
  Network: { package: '@capacitor/network', iosClass: 'CAPNetworkPlugin' },
  Browser: {
    package: '@capacitor/browser',
    iosClass: null,
    why: 'Android sign-in only; iOS uses FearvilleAuth',
  },
  FearvilleAuth: {
    package: null,
    iosClass: null,
    why: 'local plugin in mobile/native/ios/FearvilleAuthPlugin.swift',
  },
  SecureStoragePlugin: {
    package: null,
    iosClass: null,
    why: 'not installed: shells keep tokens in HttpOnly cookies, so secureStorage stays unavailable',
  },
};
const PLATFORM_PACKAGES = [
  '@capacitor/core',
  '@capacitor/ios',
  '@capacitor/android',
  '@capacitor/cli',
];

void test('contract: plugins used, bundled on iOS and installed agree', () => {
  const adapter = readFileSync('lib/native/capacitor.ts', 'utf8');
  const used = [...adapter.matchAll(/plugin\('(\w+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...used].sort(),
    Object.keys(CONTRACT).sort(),
    'capacitor.ts plugins must match the contract in this test',
  );

  const bundle = readFileSync('mobile/tests/ios-bundle.mjs', 'utf8');
  const list = bundle.match(/for \(const plugin of \[([\s\S]*?)\]\)/);
  assert.ok(list, 'plugin list not found in ios-bundle.mjs');
  const asserted = [...list[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    asserted.sort(),
    Object.values(CONTRACT)
      .map((p) => p.iosClass)
      .filter((c): c is string => !!c)
      .sort(),
    'ios-bundle.mjs plugin classes must match the contract',
  );

  const pkg = JSON.parse(readFileSync('mobile/package.json', 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const installed = Object.keys(pkg.dependencies).filter(
    (name) => !PLATFORM_PACKAGES.includes(name),
  );
  assert.deepEqual(
    installed.sort(),
    Object.values(CONTRACT)
      .map((p) => p.package)
      .filter((p): p is string => !!p)
      .sort(),
    'mobile/package.json plugins must match the contract',
  );
  assert.ok(existsSync('mobile/native/ios/FearvilleAuthPlugin.swift'));
});
