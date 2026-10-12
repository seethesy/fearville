import test from 'node:test';
import assert from 'node:assert/strict';
import { keepScreenAwake } from '../lib/native/keep-awake.ts';
import { defaultPreferences, normalizePreferences } from '../lib/accounts/preferences.ts';

const g = globalThis as Record<string, unknown>;
const original = { window: g.window, navigator: g.navigator, document: g.document };
const set = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
test.afterEach(() => {
  for (const [name, value] of Object.entries(original)) set(name, value);
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeDocument() {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  set('document', doc);
  return {
    doc,
    show(state: 'visible' | 'hidden') {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event('visibilitychange'));
    },
  };
}
function fakeWakeLock() {
  const log: string[] = [];
  let current: (EventTarget & { release(): Promise<void> }) | null = null;
  set('navigator', {
    wakeLock: {
      request: async (type: string) => {
        log.push('request:' + type);
        const sentinel = Object.assign(new EventTarget(), {
          release: async () => {
            log.push('release');
            sentinel.dispatchEvent(new Event('release'));
          },
        });
        current = sentinel;
        return sentinel;
      },
    },
  });
  return {
    log,
    // The browser drops the lock itself when the tab is hidden.
    browserRelease: () => current?.dispatchEvent(new Event('release')),
  };
}

void test('browser: holds a Wake Lock, re-acquires after the tab returns, releases on stop', async () => {
  set('window', undefined);
  const page = fakeDocument();
  const lock = fakeWakeLock();
  const stop = keepScreenAwake();
  await tick();
  assert.deepEqual(lock.log, ['request:screen']);
  page.show('hidden');
  lock.browserRelease();
  await tick();
  assert.deepEqual(lock.log, ['request:screen'], 'no request while hidden');
  page.show('visible');
  await tick();
  assert.deepEqual(lock.log, ['request:screen', 'request:screen']);
  stop();
  await tick();
  assert.deepEqual(lock.log, ['request:screen', 'request:screen', 'release']);
  page.show('visible');
  await tick();
  assert.equal(lock.log.length, 3, 'stopped: no more requests');
});

void test('unsupported browsers and denied requests are skipped silently', async () => {
  set('window', undefined);
  fakeDocument();
  set('navigator', {});
  const stop = keepScreenAwake();
  await tick();
  stop();
  set('navigator', { wakeLock: { request: async () => { throw new Error('NotAllowedError'); } } });
  const stopDenied = keepScreenAwake();
  await tick();
  assert.doesNotThrow(stopDenied);
});

void test('app shell: uses native keep-awake instead of the Wake Lock API', async () => {
  const calls: unknown[] = [];
  set('window', Object.assign(new EventTarget(), {
    FearvilleNative: {
      version: 1,
      capabilities: ['keepAwake'],
      call: async (method: string, args: unknown) => calls.push([method, args]),
    },
  }));
  fakeDocument();
  set('navigator', { wakeLock: { request: async () => assert.fail('native keep-awake replaces Wake Lock') } });
  const stop = keepScreenAwake();
  await tick();
  stop();
  await tick();
  assert.deepEqual(calls, [
    ['keepAwake.set', { on: true }],
    ['keepAwake.set', { on: false }],
  ]);
});

void test('keep screen awake is a personal setting, on by default', () => {
  assert.equal(defaultPreferences.keepAwake, true);
  assert.equal(normalizePreferences({}).keepAwake, true);
  assert.equal(normalizePreferences({ keepAwake: false }).keepAwake, false);
  assert.throws(() => normalizePreferences({ keepAwake: 'no' }), /settings/);
});
