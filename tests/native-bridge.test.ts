import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bridgeVersion,
  capabilities,
  haptic,
  isNativeShell,
  nativeCue,
  nativeKeepAwake,
  onLifecycle,
  secureStorage,
  share,
  NATIVE_EVENT,
} from '../lib/native/bridge.ts';

const g = globalThis as Record<string, unknown>;
const original = { window: g.window, navigator: g.navigator, document: g.document };
function setGlobal(name: 'window' | 'navigator' | 'document', value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
function restore() {
  for (const [name, value] of Object.entries(original))
    setGlobal(name as 'window', value);
}
function fakeWindow(native?: unknown) {
  const target = new EventTarget() as EventTarget & Record<string, unknown>;
  if (native) target.FearvilleNative = native;
  setGlobal('window', target);
  return target;
}
function fakeNative(caps: string[], impl: (method: string, args?: unknown) => unknown = () => undefined) {
  const calls: [string, unknown][] = [];
  return {
    calls,
    host: {
      version: 2,
      capabilities: caps,
      call: async (method: string, args?: unknown) => {
        calls.push([method, args]);
        return impl(method, args);
      },
    },
  };
}

test.afterEach(restore);

void test('desktop browser: no shell, every capability is a safe no-op', async () => {
  setGlobal('window', undefined);
  setGlobal('navigator', {});
  assert.equal(isNativeShell(), false);
  assert.equal(bridgeVersion(), 0);
  assert.deepEqual(capabilities(), []);
  assert.equal(await secureStorage.get('account'), null);
  assert.equal(await secureStorage.set('account', 'token'), false);
  assert.equal(await secureStorage.remove('seat:123456'), false);
  assert.doesNotThrow(() => haptic('tap'));
  assert.equal(nativeCue('phase', 0.5), false);
  assert.equal(await nativeKeepAwake(true), false);
  assert.equal(await share({ title: 'T', url: 'https://fearville.app/?join=123456' }), 'unavailable');
  const unsubscribe = onLifecycle(() => assert.fail('no events without a window'));
  assert.doesNotThrow(unsubscribe);
});

void test('browser fallbacks: vibration, Web Share, clipboard, visibility and network', async () => {
  const vibrations: unknown[] = [];
  const shared: unknown[] = [];
  setGlobal('navigator', {
    vibrate: (pattern: unknown) => vibrations.push(pattern),
    share: async (content: unknown) => shared.push(content),
  });
  haptic('tap');
  haptic('error');
  assert.deepEqual(vibrations, [10, [30, 40, 30]]);
  assert.equal(await share({ title: 'T', url: 'u' }), 'shared');
  assert.equal(shared.length, 1);

  const copied: string[] = [];
  setGlobal('navigator', { clipboard: { writeText: async (text: string) => copied.push(text) } });
  assert.equal(await share({ title: 'T', url: 'https://fearville.app/?join=123456' }), 'copied');
  assert.deepEqual(copied, ['https://fearville.app/?join=123456']);

  setGlobal('navigator', {
    share: async () => {
      throw Object.assign(new Error('cancel'), { name: 'AbortError' });
    },
  });
  assert.equal(await share({ title: 'T', url: 'u' }), 'cancelled');

  const win = fakeWindow();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  setGlobal('document', doc);
  const events: string[] = [];
  const stop = onLifecycle((e) => events.push(e));
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('offline'));
  win.dispatchEvent(new Event('online'));
  stop();
  win.dispatchEvent(new Event('online'));
  assert.deepEqual(events, ['pause', 'resume', 'offline', 'online']);
});

void test('in a shell, each wrapper calls only capabilities the shell declares', async () => {
  const native = fakeNative(['haptics', 'audio', 'secureStorage', 'share', 'keepAwake', 'lifecycle'], (method) =>
    method === 'secureStorage.get' ? 'stored-token' : undefined,
  );
  const win = fakeWindow(native.host);
  setGlobal('navigator', { vibrate: () => assert.fail('native haptics replace vibration') });
  setGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  assert.equal(isNativeShell(), true);
  assert.equal(bridgeVersion(), 2);
  assert.equal(await secureStorage.get('account'), 'stored-token');
  assert.equal(await secureStorage.set('seat:123456', 'seat-token'), true);
  haptic('error');
  assert.equal(nativeCue('phase', 4), true);
  assert.equal(await nativeKeepAwake(true), true);
  assert.equal(await share({ title: 'T', url: 'u' }), 'shared');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(native.calls, [
    ['secureStorage.get', { key: 'account' }],
    ['secureStorage.set', { key: 'seat:123456', value: 'seat-token' }],
    ['haptics.play', { kind: 'error' }],
    ['audio.cue', { kind: 'phase', volume: 1 }],
    ['keepAwake.set', { on: true }],
    ['share.open', { title: 'T', url: 'u' }],
  ]);

  const events: string[] = [];
  const stop = onLifecycle((e) => events.push(e));
  win.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: { type: 'lifecycle', state: 'resume' } }));
  win.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: { type: 'lifecycle', state: 'bogus' } }));
  win.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: { type: 'push', state: 'pause' } }));
  stop();
  assert.deepEqual(events, ['resume']);
});

void test('an older shell without a capability, or a failing call, falls back safely', async () => {
  const native = fakeNative(['haptics'], () => {
    throw new Error('native failure');
  });
  fakeWindow(native.host);
  const copied: string[] = [];
  setGlobal('navigator', { clipboard: { writeText: async (text: string) => copied.push(text) } });
  assert.equal(nativeCue('error', 0.2), false, 'no audio capability: play web audio');
  assert.equal(await nativeKeepAwake(true), false, 'no keepAwake capability: use Wake Lock');
  assert.equal(await secureStorage.get('account'), null);
  assert.equal(await share({ title: 'T', url: 'link' }), 'copied');
  assert.doesNotThrow(() => haptic('tap'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(native.calls.map(([m]) => m), ['haptics.play']);

  fakeWindow({ version: 1, capabilities: 'not-a-list', call: async () => undefined });
  assert.deepEqual(capabilities(), []);
  fakeWindow({ version: 1, capabilities: ['share'] });
  assert.equal(isNativeShell(), false, 'a host without call() is ignored');
});
