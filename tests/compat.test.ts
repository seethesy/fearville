// FEAR-120: client version header, minimum/recommended gate, and the rule
// that web code reaches native features only through lib/native/bridge.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  clientHeader,
  clientLabel,
  compatibility,
  gateExempt,
  parseClient,
} from '../lib/compat/versions.ts';
import {
  appInfo,
  haptic,
  nativeKeepAwake,
  share,
} from '../lib/native/bridge.ts';

void test('client header round-trips; malformed values are unknown and never gated', () => {
  const ios = parseClient('ios/1.2.0/42/1');
  assert.deepEqual(ios, {
    platform: 'ios',
    appVersion: '1.2.0',
    build: 42,
    bridgeVersion: 1,
  });
  assert.equal(clientHeader(ios), 'ios/1.2.0/42/1');
  assert.deepEqual(parseClient('web/abc123'), {
    platform: 'web',
    buildId: 'abc123',
  });
  for (const bad of [
    null,
    '',
    'ios/1/x/1',
    'ios/1/2',
    'windows/1/2/3',
    'ios/1/2/3/4',
    'web/a b',
  ])
    assert.equal(parseClient(bad).platform, 'unknown', String(bad));
  assert.equal(clientLabel(ios), 'ios/1.2.0/42');
  assert.equal(clientLabel(parseClient('web/x')), 'web');
});

void test('minimum and recommended builds gate only shells that report a build', () => {
  const builds = {
    ios: { minimum: 10, recommended: 20, updateUrl: 'https://x.invalid/u' },
  };
  const at = (build: number) =>
    compatibility(
      { platform: 'ios', appVersion: '1', build, bridgeVersion: 1 },
      builds,
    ).status;
  assert.equal(at(9), 'required');
  assert.equal(at(10), 'recommended');
  assert.equal(at(19), 'recommended');
  assert.equal(at(20), 'ok');
  assert.equal(at(0), 'ok'); // build not reported yet
  assert.deepEqual(
    compatibility(
      { platform: 'ios', appVersion: '1', build: 1, bridgeVersion: 1 },
      builds,
    ),
    { status: 'required', updateUrl: 'https://x.invalid/u' },
  );
  assert.equal(
    compatibility(
      { platform: 'android', appVersion: '1', build: 1, bridgeVersion: 1 },
      builds,
    ).status,
    'ok',
  );
  assert.equal(
    compatibility({ platform: 'web', buildId: 'x' }, builds).status,
    'ok',
  );
  assert.ok(gateExempt('/api/flags'));
  assert.ok(gateExempt('/api/health'));
  assert.ok(gateExempt('/table'));
  assert.ok(!gateExempt('/api/game'));
  assert.ok(!gateExempt('/api/table/socket'));
});

void test('an older shell missing a capability falls back without errors', async () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, navigator: g.navigator };
  const set = (name: string, value: unknown) =>
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  const calls: string[] = [];
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  // Bridge v1 shell with no haptics/share/keepAwake and no app details.
  win.FearvilleNative = {
    version: 1,
    capabilities: ['lifecycle'],
    call: async (method: string) => {
      calls.push(method);
      throw Error('missing ' + method);
    },
  };
  set('window', win);
  set('navigator', {});
  try {
    haptic('tap');
    assert.equal(await nativeKeepAwake(true), false);
    assert.equal(
      await share({ title: 'Join', url: 'https://fearville.app/t/1' }),
      'unavailable',
    );
    assert.deepEqual(calls, []);
    assert.equal(appInfo(), null);
    win.FearvilleNative = {
      ...(win.FearvilleNative as object),
      app: { platform: 'ios', version: '1.0 (beta)', build: '7' },
    };
    assert.deepEqual(appInfo(), {
      platform: 'ios',
      version: '1.0beta',
      build: 7,
      bridgeVersion: 1,
    });
  } finally {
    set('window', saved.window);
    set('navigator', saved.navigator);
  }
});

void test('web code reaches native features only through lib/native', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(ts|tsx)$/.test(name)) {
        const source = readFileSync(file, 'utf8');
        if (
          /\bFearvilleNative\b|\bCapacitor\s*[.?[]|window\.Capacitor/.test(
            source,
          )
        )
          offenders.push(file);
      }
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
  assert.deepEqual(
    offenders.filter(
      (f) => !f.startsWith(path.join('lib', 'native') + path.sep),
    ),
    [],
    'Use lib/native/bridge.ts (capability-checked wrappers) instead.',
  );
});
