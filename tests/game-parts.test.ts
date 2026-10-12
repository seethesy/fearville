import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  newPlayer,
  MAX_PLAYERS,
  type Game,
} from '../lib/game/types.ts';
import { recapOf } from '../lib/game/lobby.ts';
import {
  assembleGame,
  partChanges,
  splitGame,
  PART_LIMIT,
  type PartRow,
} from '../lib/game/parts.ts';

const bytes = (text: string) => new TextEncoder().encode(text).length;
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// A full 18-player table after a long, chatty game, with older recaps.
function heavyGame(): Game {
  const g = newGame('HEAVY1', 'Host');
  g.players = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    ...newPlayer(`Player ${i + 1}`, i + 1),
    avatar: 'data:image/jpeg;base64,/9j/' + 'A'.repeat(15_900),
  }));
  g.gameStartedAt = 1;
  const text = (i: number) =>
    `Message ${i} ✦ `.repeat(1 + (i % 250)).slice(0, 4000);
  g.messages = Array.from({ length: 4000 }, (_, i) => ({
    id: crypto.randomUUID(),
    from: g.players[i % MAX_PLAYERS].id,
    to: i % 5 ? 'all' : g.players[(i + 1) % MAX_PLAYERS].id,
    text: text(i),
    at: i,
    kind: 'chat',
  })) as Game['messages'];
  g.log = Array.from({ length: 3000 }, (_, i) => ({
    id: crypto.randomUUID(),
    text: `Night ${i}: something happened to ${g.players[i % MAX_PLAYERS].name}.`,
    at: i,
    public: i % 2 === 0,
  }));
  g.history = Array.from({ length: 400 }, (_, i) => ({
    id: crypto.randomUUID(),
    text: `Decision ${i}`,
    at: i,
    before: '',
  }));
  g.notebooks = Object.fromEntries(
    g.players.map((p) => [
      p.id,
      { text: 'Suspicions… '.repeat(1500), roles: {}, players: {} },
    ]),
  ) as Game['notebooks'];
  // Each finished game keeps a recap with that game's whole chat.
  g.recaps = Array.from({ length: 3 }, (_, i) =>
    structuredClone({ ...recapOf(g, 10 + i), id: `HEAVY1:${i}` }),
  );
  g.rite = {
    config: {},
    seed: 'seed',
    epoch: 'epoch',
    status: 'open',
    plans: [],
    squads: Array.from({ length: 6 }, (_, i) => ({
      id: `vigil-${i}`,
      members: g.players.slice(i * 3, i * 3 + 3).map((p) => p.id),
      state: {
        type: 'board',
        blocks: Array.from({ length: 40 }, (_, b) => ({ b, x: b % 6 })),
      },
    })),
    resolvedNight: 0,
  } as unknown as Game['rite'];
  return g;
}

void test('an 18-player game with heavy chat never stores a part over 1 MB', () => {
  const game = heavyGame();
  const total = bytes(JSON.stringify(game));
  assert.ok(
    total > 8_000_000,
    `fixture should exceed the old blob limit (${total})`,
  );
  const { core, parts } = splitGame(game);
  assert.ok(bytes(core) <= PART_LIMIT, `core is ${bytes(core)} bytes`);
  for (const [key, text] of parts)
    assert.ok(bytes(text) <= PART_LIMIT, `${key} is ${bytes(text)} bytes`);
  assert.ok([...parts.keys()].filter((k) => k.startsWith('chat:')).length > 1);
  assert.ok([...parts.keys()].some((k) => k.startsWith('recapchat:00002:')));
  assert.deepEqual(assembleGame(core, parts).game, roundTrip(game));
});

void test('round trip keeps every stored field, including empty and missing ones', () => {
  const game = heavyGame();
  const sparse = newGame('SPARSE', 'Host');
  delete sparse.notebooks;
  delete sparse.recaps;
  for (const g of [
    game,
    sparse,
    { ...sparse, notebooks: {}, rite: { ...game.rite!, squads: [] } },
  ]) {
    const { core, parts } = splitGame(g as Game);
    const { game: back, legacy } = assembleGame(core, parts);
    assert.equal(legacy, false);
    assert.deepEqual(back, roundTrip(g));
  }
});

void test('appending a message or saving one notebook changes only that part', () => {
  const game = heavyGame();
  const stored = splitGame(game);
  const loaded = new Map<string, PartRow>(
    [...stored.parts].map(([k, state]) => [k, { state, rev: 3 }]),
  );
  game.messages.push({
    ...game.messages[0],
    id: crypto.randomUUID(),
    text: 'One more',
  });
  let next = splitGame(game);
  let changes = partChanges(loaded, next.parts);
  assert.equal(next.core, stored.core);
  assert.deepEqual(changes.deletes, []);
  assert.equal(changes.upserts.length, 1);
  assert.match(changes.upserts[0].key, /^chat:/);
  assert.equal(changes.upserts[0].rev, 3);

  const fresh = heavyGame();
  const freshStored = splitGame(fresh);
  const freshLoaded = new Map<string, PartRow>(
    [...freshStored.parts].map(([k, state]) => [k, { state, rev: 1 }]),
  );
  const id = fresh.players[4].id;
  fresh.notebooks![id] = { text: 'Changed', roles: {}, players: {} } as never;
  next = splitGame(fresh);
  changes = partChanges(freshLoaded, next.parts);
  assert.deepEqual(
    changes.upserts.map((u) => u.key),
    [`notes:${id}`],
  );

  // Clearing a list or the notebooks deletes their parts.
  fresh.notebooks = {};
  fresh.messages = [];
  changes = partChanges(freshLoaded, splitGame(fresh).parts);
  assert.ok(changes.deletes.some((d) => d.key.startsWith('chat:')));
  assert.ok(changes.deletes.some((d) => d.key === `notes:${id}`));
});

void test('a single oversized part fails with a clear error', () => {
  const game = newGame('BIG', 'Host');
  game.players = [newPlayer('Ada', 1)];
  game.notebooks = {
    [game.players[0].id]: {
      text: 'x'.repeat(PART_LIMIT + 1),
      roles: {},
      players: {},
    },
  } as never;
  assert.throws(
    () => splitGame(game),
    /Session storage is full \(a notebook is too large\)/,
  );
});

void test('old single-blob rows are complete on their own and ignore stale parts', () => {
  const game = heavyGame();
  const blob = JSON.stringify(game);
  const { game: back, legacy } = assembleGame(blob, [
    ['chat:00000', '[{"id":"stale"}]'],
  ]);
  assert.equal(legacy, true);
  assert.deepEqual(back, roundTrip(game));
});
