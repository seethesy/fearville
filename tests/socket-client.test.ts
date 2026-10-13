import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TableConnection,
  FALLBACK_POLL_MS,
  reconnectDelay,
} from '../lib/game/socket-client.ts';
import { parseViewEnvelope, viewContent } from '../lib/game/socket-protocol.ts';
import { newestView } from '../lib/game/live.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { view } from '../lib/game/view.ts';

class Socket {
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  readyState = 0;
  onopen: WebSocket['onopen'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  onmessage: WebSocket['onmessage'] = null;
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
  }
  drop() {
    this.readyState = 3;
    this.onclose?.call(
      this as unknown as WebSocket,
      new Event('close') as CloseEvent,
    );
  }
  message(data: string) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      { data } as MessageEvent,
    );
  }
}
void test('actions settle only on matching ack; errors and lost acks do not report success', async () => {
  const time = clock(),
    socket = new Socket();
  const connection = new TableConnection({
    code: '123456',
    me: 'host',
    ...time,
    connect: () => socket as unknown as WebSocket,
    poll: async () => {},
    status: () => {},
    view: () => {},
  });
  connection.start();
  socket.open();
  const data = view(
    newGame('123456', 'Host'),
    { id: 'host', host: true },
    1,
    1000,
  );
  socket.message(
    JSON.stringify({ type: 'view', version: 1, serverNow: 1000, data }),
  );
  const result = connection.send({ action: 'vote', yes: true }, 'vote-1')!;
  assert.deepEqual(JSON.parse(socket.sent[1]), {
    type: 'action',
    id: 'vote-1',
    command: { action: 'vote', yes: true },
  });
  socket.message(JSON.stringify({ type: 'ack', id: 'other', ok: true }));
  socket.message(
    JSON.stringify({
      type: 'ack',
      id: 'vote-1',
      ok: false,
      error: 'This ballot closed.',
    }),
  );
  assert.equal((await result).error, 'This ballot closed.');
  const lost = connection.send({ action: 'vote' }, 'vote-2')!;
  const rejected = assert.rejects(lost, /closed/);
  socket.drop();
  connection.stop();
  await rejected;
  assert.equal(connection.send({ action: 'vote' }, 'vote-3'), null);
  connection.stop();
});
function clock() {
  let now = 0,
    id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const setTimer = ((fn: () => void, ms: number) => {
    timers.set(++id, { fn, at: now + ms });
    return id;
  }) as unknown as typeof setTimeout;
  const clearTimer = ((key: number) =>
    timers.delete(key)) as unknown as typeof clearTimeout;
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers]
        .filter(([, v]) => v.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = end;
  };
  return { setTimer, clearTimer, advance };
}
void test('socket failure starts fallback, reconnects, and stops polling when live', async () => {
  const time = clock(),
    sockets: Socket[] = [],
    states: boolean[] = [];
  let polls = 0;
  const g = newGame('123456', 'Host'),
    frame = view(g, { id: 'host', host: true }, 5, 1000);
  const current: { value: typeof frame | null } = { value: null };
  const connection = new TableConnection({
    code: g.code,
    me: 'host',
    ...time,
    poll: async () => {
      polls++;
    },
    status: (open) => states.push(open),
    connect: () => {
      const s = new Socket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    view: (message) => {
      current.value = newestView(current.value, message.data);
    },
  });
  connection.start();
  await Promise.resolve();
  sockets[0].open();
  sockets[0].message(
    JSON.stringify({ type: 'view', version: 5, serverNow: 1000, data: frame }),
  );
  time.advance(FALLBACK_POLL_MS);
  await Promise.resolve();
  assert.equal(polls, 1);
  sockets[0].drop();
  await Promise.resolve();
  assert.equal(polls, 2);
  time.advance(250);
  sockets[1].open();
  sockets[1].message(
    JSON.stringify({ type: 'view', version: 5, serverNow: 1000, data: frame }),
  );
  const stale = { ...frame, version: 4, serverNow: 2000 };
  sockets[1].message(
    JSON.stringify({ type: 'view', version: 4, serverNow: 2000, data: stale }),
  );
  assert.equal(current.value?.version, 5);
  time.advance(FALLBACK_POLL_MS);
  await Promise.resolve();
  assert.equal(polls, 2);
  connection.stop();
  sockets[1].message(
    JSON.stringify({
      type: 'view',
      version: 6,
      serverNow: 1000,
      data: { ...frame, version: 6 },
    }),
  );
  assert.deepEqual(states, [true, false, true]);
  assert.equal(current.value?.version, 5);
});
void test('a refused socket polls only every 30 seconds while retries back off', async () => {
  const time = clock();
  let polls = 0;
  const connection = new TableConnection({
    code: '123456',
    me: 'host',
    ...time,
    connect: () => {
      throw Error('offline');
    },
    poll: async () => {
      polls++;
    },
    view: () => undefined,
    status: () => undefined,
  });
  connection.start();
  await Promise.resolve();
  time.advance(29999);
  await Promise.resolve();
  assert.equal(polls, 1);
  time.advance(1);
  await Promise.resolve();
  assert.equal(polls, 2);
  connection.stop();
  time.advance(60000);
  assert.equal(polls, 2);
});
void test('dropped mid-vote queues ordered actions with the same ids and waits for catch-up before replay', async () => {
  const time = clock(),
    sockets: Socket[] = [],
    phases: string[] = [];
  const game = newGame('123456', 'Host');
  const delivered: number[] = [];
  const frame = (socket: Socket, version: number, now: number) =>
    socket.message(
      JSON.stringify({
        type: 'view',
        version,
        serverNow: now,
        data: view(game, { id: 'host', host: true }, version, now),
      }),
    );
  const connection = new TableConnection({
    code: game.code,
    me: 'host',
    ...time,
    random: () => 1,
    connect: () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    poll: async () => {},
    status: () => {},
    phase: (phase) => phases.push(phase),
    view: (message) => delivered.push(message.serverNow),
  });
  connection.start();
  sockets[0].open();
  frame(sockets[0], 4, 1000);
  const first = connection.send(
    { action: 'vote', ballot: 'day-1', yes: true },
    'vote-first',
  )!;
  sockets[0].drop();
  const second = connection.send(
    { action: 'chat', text: 'queued' },
    'chat-second',
  )!;
  time.advance(250);
  sockets[1].open();
  assert.deepEqual(JSON.parse(sockets[1].sent[0]), {
    type: 'hello',
    lastVersion: 4,
  });
  assert.equal(sockets[1].sent.length, 1, 'queue waits for current view');
  frame(sockets[1], 6, 2000);
  assert.equal(JSON.parse(sockets[1].sent[1]).id, 'vote-first');
  assert.equal(sockets[1].sent.length, 2, 'one action at a time');
  sockets[1].message(
    JSON.stringify({ type: 'ack', id: 'vote-first', ok: true }),
  );
  assert.equal((await first).ok, true);
  assert.equal(JSON.parse(sockets[1].sent[2]).id, 'chat-second');
  sockets[1].message(
    JSON.stringify({
      type: 'ack',
      id: 'chat-second',
      ok: false,
      error: 'This window closed.',
    }),
  );
  assert.equal((await second).error, 'This window closed.');
  assert.deepEqual(delivered, [1000, 2000]);
  connection.resume();
  assert.equal(
    sockets[1].readyState,
    3,
    'resume replaces apparently-open stale sockets',
  );
  assert.equal(sockets.length, 3);
  connection.stop();
});
void test('offline banners appear at one and fifteen seconds and jitter stays within the capped backoff', () => {
  const time = clock(),
    phases: string[] = [];
  const connection = new TableConnection({
    code: '123456',
    me: 'host',
    ...time,
    connect: () => {
      throw Error('offline');
    },
    random: () => 0,
    poll: async () => {},
    view: () => {},
    status: () => {},
    phase: (phase) => phases.push(phase),
  });
  connection.start();
  time.advance(999);
  assert.deepEqual(phases, ['connecting']);
  time.advance(1);
  assert.equal(phases.at(-1), 'reconnecting');
  time.advance(13999);
  assert.equal(phases.at(-1), 'reconnecting');
  time.advance(1);
  assert.equal(phases.at(-1), 'offline');
  for (let n = 0; n < 30; n++) {
    assert.ok(reconnectDelay(n, 0) >= 200);
    assert.ok(reconnectDelay(n, 1) <= 5000);
  }
  connection.stop();
});
void test('envelopes reject another seat, malformed data and mismatched versions; hashes ignore clock/version metadata', () => {
  const g = newGame('123456', 'Host');
  g.players = [newPlayer('Sam', 1)];
  const data = view(g, { id: g.players[0].id, host: false }, 1, 1000);
  const frame = JSON.stringify({
    type: 'view',
    version: 1,
    serverNow: 1000,
    data,
  });
  assert.ok(parseViewEnvelope(frame, g.code, g.players[0].id));
  assert.equal(parseViewEnvelope(frame, g.code, 'host'), null);
  assert.equal(parseViewEnvelope(frame, '654321', g.players[0].id), null);
  assert.equal(parseViewEnvelope('{', g.code, g.players[0].id), null);
  assert.equal(
    viewContent(data),
    viewContent({ ...data, version: 8, serverNow: 8000 }),
  );
  assert.notEqual(
    viewContent(data),
    viewContent({ ...data, hostName: 'Renamed' }),
  );
});
