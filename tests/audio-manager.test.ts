import test from 'node:test';
import assert from 'node:assert/strict';
import { musicContext, audioVolume } from '../lib/audio/context.ts';
import {
  AudioManager,
  musicTrack,
  type AudioVoice,
  type TrackMap,
} from '../lib/audio/manager.ts';
import { BrowserAudioBackend } from '../lib/audio/browser.ts';

const map: TrackMap = {
  music: {
    hub: '/hub.wav',
    day: '/day.wav',
    night: '/night.wav',
    rite: '/rite.wav',
  },
  effects: { phase: '/phase.wav', error: '/error.wav' },
};
const settings = { music: 40, sfx: 60, muteInBackground: true };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function fakeBackend() {
  const voices: {
    url: string;
    loop: boolean;
    fades: number[];
    stops: number[];
  }[] = [];
  return {
    voices,
    unlock: async () => true,
    start: async (url: string, loop: boolean) => {
      const state = { url, loop, fades: [] as number[], stops: [] as number[] };
      voices.push(state);
      return {
        fade: (volume: number) => {
          state.fades.push(volume);
        },
        stop: (after = 0) => {
          state.stops.push(after);
        },
      };
    },
  };
}
void test('public context selection covers hub, lobby, day, voting, night, Rite, Rush and end results', () => {
  for (const [input, expected] of [
    [{ path: '/profile' }, 'hub'],
    [{ path: '/table', phase: 'lobby' }, 'lobby'],
    [{ path: '/table', phase: 'discussion' }, 'day'],
    [{ path: '/table', phase: 'voting' }, 'voting'],
    [{ path: '/table', phase: 'night' }, 'night'],
    [{ path: '/puzzle-rush' }, 'puzzleRush'],
    [
      { path: '/table', phase: 'ended', winner: 'Good · special victory' },
      'end.good',
    ],
    [{ path: '/table', phase: 'ended', winner: 'Evil' }, 'end.evil'],
    [{ path: '/table', phase: 'night', rite: { active: true } }, 'rite'],
    [
      {
        path: '/table',
        phase: 'night',
        rite: { active: true, pattern: 'lab' },
      },
      'rite.lab',
    ],
  ] as const)
    assert.equal(musicContext(input), expected);
  assert.equal(musicTrack('rite.board', map), '/rite.wav');
  assert.equal(musicTrack('voting', map), '/day.wav');
  assert.equal(
    musicTrack('rite.lab', {
      ...map,
      music: { ...map.music, 'rite.lab': '/lab.wav' },
    }),
    '/lab.wav',
  );
});
void test('settings gate on gesture and background, independently for music and SFX', () => {
  assert.equal(audioVolume(settings, 'music', false, false), 0);
  assert.equal(audioVolume(settings, 'music', true, true), 0);
  assert.equal(audioVolume(settings, 'music', true, false), 0.4);
  assert.equal(audioVolume(settings, 'sfx', true, false), 0.6);
  assert.equal(
    audioVolume({ ...settings, muteInBackground: false }, 'sfx', true, true),
    0.6,
  );
  assert.equal(
    audioVolume({ ...settings, music: NaN }, 'music', true, false),
    0,
  );
});
void test('default music is muted and nothing loads before a gesture', async () => {
  const backend = fakeBackend(),
    manager = new AudioManager(backend, map);
  manager.setContext('night');
  await tick();
  assert.equal(backend.voices.length, 0);
  await manager.playEffect('phase');
  assert.equal(backend.voices.length, 0);
  await manager.unlock();
  assert.equal(backend.voices.length, 0);
  manager.setPreferences(settings);
  await tick();
  assert.equal(backend.voices[0].url, '/night.wav');
});
void test('same track/context continues, different tracks crossfade, mute/background stop loops', async () => {
  const backend = fakeBackend(),
    manager = new AudioManager(backend, map);
  manager.setPreferences(settings);
  await manager.unlock();
  manager.setContext('hub');
  manager.setPreferences({ ...settings, music: 30 });
  await tick();
  assert.equal(backend.voices.length, 1);
  assert.equal(backend.voices[0].fades.at(-1), 0.3);
  manager.setContext('day');
  await tick();
  assert.equal(backend.voices.length, 2);
  assert.equal(backend.voices[0].fades.at(-1), 0);
  assert.ok(backend.voices[0].stops[0] > 0);
  assert.equal(backend.voices[1].loop, true);
  manager.setBackground(true);
  await tick();
  assert.equal(backend.voices[1].fades.at(-1), 0);
  manager.setBackground(false);
  await tick();
  assert.equal(backend.voices.length, 3);
  manager.setPreferences({ ...settings, music: 0 });
  await tick();
  assert.equal(backend.voices[2].fades.at(-1), 0);
});
void test('late-loading obsolete context is discarded before becoming audible', async () => {
  let release: ((voice: AudioVoice) => void) | undefined;
  const late = { fades: [] as number[], stopped: false };
  const backend = fakeBackend();
  const manager = new AudioManager(
    {
      unlock: backend.unlock,
      start: (url, loop) =>
        url === '/hub.wav'
          ? new Promise((resolve) => {
              release = resolve;
            })
          : backend.start(url, loop),
    },
    map,
  );
  manager.setPreferences(settings);
  const pending = manager.unlock();
  await tick();
  manager.setContext('night');
  await tick();
  release!({
    fade: (volume) => {
      late.fades.push(volume);
    },
    stop: () => {
      late.stopped = true;
    },
  });
  await pending;
  assert.equal(late.stopped, true);
  assert.deepEqual(late.fades, []);
  assert.equal(backend.voices[0].url, '/night.wav');
});
void test('effects respect native bridge, live mute, disabled manager and safe backend failures', async () => {
  const backend = fakeBackend(),
    native: string[] = [];
  const manager = new AudioManager(backend, map, (kind) => {
    native.push(kind);
    return true;
  });
  manager.setPreferences({ ...settings, music: 0 });
  await manager.unlock();
  await manager.playEffect('phase');
  assert.deepEqual(native, ['phase']);
  assert.equal(backend.voices.length, 0);
  manager.setBackground(true);
  await manager.playEffect('error');
  assert.equal(native.length, 1);
  manager.setPreferences({ ...settings, music: 0, muteInBackground: false });
  await manager.playEffect('error');
  assert.equal(native.length, 2);
  manager.setEnabled(false);
  await manager.playEffect('phase');
  assert.equal(native.length, 2);
  const unavailable = new AudioManager(
    {
      unlock: async () => true,
      start: async () => {
        throw Error('network');
      },
    },
    map,
  );
  unavailable.setPreferences(settings);
  await unavailable.unlock();
  await unavailable.playEffect('phase');
});
void test('web effects use SFX volume and are muted when preferences or lifecycle changes', async () => {
  const backend = fakeBackend(),
    manager = new AudioManager(backend, map);
  manager.setPreferences({ ...settings, music: 0 });
  await manager.unlock();
  await manager.playEffect('error');
  assert.equal(backend.voices[0].fades.at(-1), 0.6);
  manager.setPreferences({ ...settings, music: 0, sfx: 0 });
  assert.equal(backend.voices[0].fades.at(-1), 0);
  manager.setEnabled(false);
  assert.ok(backend.voices[0].stops.length);
});
void test('browser backend lazily fetches and caches decoded tracks; failures can retry', async () => {
  const globals = globalThis as Record<string, unknown>;
  const original = {
    window: globals.window,
    AudioContext: globals.AudioContext,
    fetch: globals.fetch,
  };
  let fetches = 0,
    contexts = 0,
    fail = false;
  class FakeContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    constructor() {
      contexts++;
    }
    async resume() {}
    async decodeAudioData() {
      return {};
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        start() {},
        stop() {},
        onended: null,
      };
    }
    createGain() {
      return {
        gain: {
          value: 0,
          cancelAndHoldAtTime() {},
          linearRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
  }
  try {
    globals.window = {};
    globals.AudioContext = FakeContext;
    globals.fetch = async () => {
      fetches++;
      return { ok: !fail, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const backend = new BrowserAudioBackend();
    assert.equal(contexts, 0);
    assert.equal(await backend.start('/a', true), null);
    assert.equal(fetches, 0);
    await backend.unlock();
    assert.equal(contexts, 1);
    await backend.start('/a', true);
    await backend.start('/a', false);
    assert.equal(fetches, 1);
    fail = true;
    assert.equal(await backend.start('/b', true), null);
    fail = false;
    assert.ok(await backend.start('/b', true));
    assert.equal(fetches, 3);
  } finally {
    Object.assign(globals, original);
  }
});
