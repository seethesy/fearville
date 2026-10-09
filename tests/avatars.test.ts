import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import { returnToLobby } from '../lib/game/lobby.ts';
import {
  validAvatar,
  defaultAvatar,
  AVATARS,
  resolvedAvatars,
  assignAvatars,
} from '../lib/game/avatars.ts';
import { DEATH_EFFECTS } from '../lib/game/cosmetics.ts';

void test('cosmetics are validated atomically, public, and preserved between rounds', () => {
  const g = newGame('TEST', 'Host');
  g.players = [
    { ...newPlayer('Ada', 1), avatar: 'raven' },
    { ...newPlayer('Bea', 2), avatar: 'ghost' },
  ];
  const actor = { id: g.players[0].id, host: false };
  for (const effect of DEATH_EFFECTS) {
    execute(
      g,
      actor,
      {
        action: 'setAvatar',
        avatar: 'moon',
        deathEffect: effect.id,
      },
      1,
    );
    const p = view(g, { id: g.players[1].id, host: false }, 1, 1).players[0];
    assert.equal(p.deathEffect, effect.id);
  }
  const before = structuredClone(g.players[0]);
  for (const invalid of [{ deathEffect: 'bogus' }]) {
    assert.throws(
      () =>
        execute(
          g,
          actor,
          { action: 'setAvatar', avatar: 'cat', ...invalid },
          2,
        ),
      /Choose a/,
    );
    assert.deepEqual(g.players[0], before);
  }
  execute(g, actor, { action: 'setAvatar', avatar: 'cat' }, 3);
  returnToLobby(g, 4);
  assert.equal(g.players[0].deathEffect, before.deathEffect);
});

void test('public death signal remains private even in host view until announcement', () => {
  const g = newGame('TEST', 'Host');
  g.players = [newPlayer('Same name', 1), newPlayer('Same name', 2)];
  g.phase = 'night';
  g.night = 2;
  g.players[1].alive = false;
  g.players[1].nightDeath = 2;
  const host = { id: 'host', host: true };
  assert.equal(view(g, host, 1, 1).players[1].publicAlive, true);
  execute(g, host, { action: 'dawn', override: true }, 2);
  const result = view(g, host, 2, 2);
  assert.equal(result.players[1].publicAlive, false);
  assert.deepEqual(result.dawnAnnouncement?.playerIds, [g.players[1].id]);
  assert.equal(result.players[0].publicAlive, true);
});

void test('avatars update only the authenticated seat and survive the next lobby', () => {
  const g = newGame('TEST', 'Host');
  g.players = [
    { ...newPlayer('Ada', 1), avatar: 'raven' },
    { ...newPlayer('Bea', 2), avatar: 'ghost' },
  ];
  const actor = { id: g.players[0].id, host: false };
  execute(
    g,
    actor,
    { action: 'setAvatar', avatar: 'raven', player: g.players[1].id },
    1,
  );
  assert.equal(g.players[0].avatar, 'raven');
  assert.equal(g.players[1].avatar, 'ghost');
  assert.equal(
    view(g, { id: g.players[1].id, host: false }, 1, 1).players[0].avatar,
    'raven',
  );
  assert.equal(g.history.length, 0);
  returnToLobby(g, 2);
  assert.equal(g.players[0].avatar, 'raven');
  assert.throws(
    () =>
      execute(
        g,
        { id: 'host', host: true },
        { action: 'setAvatar', avatar: 'ghost' },
        3,
      ),
    /own player seat/,
  );
  g.players[0].departed = true;
  assert.throws(
    () => execute(g, actor, { action: 'setAvatar', avatar: 'ghost' }, 4),
    /no longer available/,
  );
});

void test('avatar validation rejects URLs, active content, and oversized photos', () => {
  for (const value of [
    'https://example.com/photo.jpg',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'missing',
    null,
    123,
    'data:image/jpeg;base64,/9j/' + 'A'.repeat(16000),
  ]) {
    assert.equal(validAvatar(value), false);
  }
  assert.equal(validAvatar('data:image/jpeg;base64,/9j/AA=='), true);
  assert.ok(AVATARS.some((a) => a.id === defaultAvatar('old-seat')));
});

void test('cosmetic changes never expose hidden deaths or roles', () => {
  const g = newGame('TEST', 'Host');
  g.players = [
    { ...newPlayer('Ada', 1), avatar: 'raven' },
    { ...newPlayer('Bea', 2), avatar: 'ghost' },
  ];
  g.phase = 'night';
  g.players[1].alive = false;
  const actor = { id: g.players[0].id, host: false };
  assert.throws(
    () => execute(g, actor, { action: 'setAvatar', avatar: 'eye' }, 1),
    /pregame lobby/,
  );
  const result = view(g, actor, 1, 1);
  assert.equal(result.players[1].alive, true);
  assert.equal(result.dawnAnnouncement, null);
  assert.ok(result.players.every((p) => !('role' in p)));
});

void test('twenty presets allocate uniquely, preserving explicit choices and photos', () => {
  assert.equal(AVATARS.length, 20);
  assert.equal(new Set(AVATARS.map((a) => a.id)).size, 20);
  const players = Array.from({ length: 20 }, (_, i) => ({
    id: `seat-${i}`,
    avatar: i < 2 ? 'moon' : undefined,
  }));
  const result = resolvedAvatars(players);
  assert.equal(new Set(result.values()).size, 20);
  assert.equal(result.get('seat-0'), 'moon');
  assert.deepEqual(resolvedAvatars([...players].reverse()), result);
  assignAvatars(players);
  assert.deepEqual(resolvedAvatars(players), result);
  players[0].avatar = 'data:image/jpeg;base64,/9j/AA==';
  assert.equal(resolvedAvatars(players).get('seat-0'), players[0].avatar);
});

void test('taken presets cannot be claimed; switching to a photo frees the preset', () => {
  const g = newGame('TEST', 'Host');
  g.players = [
    { ...newPlayer('Ada', 1), avatar: 'raven' },
    { ...newPlayer('Bea', 2), avatar: 'ghost' },
  ];
  const ada = { id: g.players[0].id, host: false };
  const bea = { id: g.players[1].id, host: false };
  const before = structuredClone(g);
  assert.throws(
    () => execute(g, bea, { action: 'setAvatar', avatar: 'raven' }, 1),
    /already taken/,
  );
  assert.deepEqual(g, before);
  const photo = 'data:image/jpeg;base64,/9j/AA==';
  execute(g, ada, { action: 'setAvatar', avatar: photo }, 2);
  execute(g, bea, { action: 'setAvatar', avatar: 'raven' }, 3);
  assert.equal(g.players[1].avatar, 'raven');
  execute(g, bea, { action: 'setAvatar', avatar: photo }, 4);
  assert.equal(g.players[0].avatar, g.players[1].avatar);
});

void test('every non-lobby phase locks photo and effect changes, including Sandbox', () => {
  const g = newGame('TEST', 'Host');
  g.sandbox = true;
  g.players = [{ ...newPlayer('Ada', 1), avatar: 'raven' }];
  const actor = { id: g.players[0].id, host: false };
  for (const phase of [
    'night',
    'discovery',
    'discussion',
    'nomination',
    'defense',
    'voting',
    'dayReview',
    'ended',
  ] as const) {
    g.phase = phase;
    const before = structuredClone(g);
    for (const change of [
      { avatar: 'ghost' },
      { avatar: 'raven', deathEffect: 'embers' },
      { avatar: 'data:image/jpeg;base64,/9j/AA==' },
    ]) {
      assert.throws(
        () => execute(g, actor, { action: 'setAvatar', ...change }, 1),
        /pregame lobby/,
      );
      assert.deepEqual(g, before);
    }
  }
  returnToLobby(g, 2);
  execute(
    g,
    actor,
    { action: 'setAvatar', avatar: 'ghost', deathEffect: 'embers' },
    3,
  );
  assert.equal(g.players[0].deathEffect, 'embers');
});

void test('Sandbox joins reserve unique avatars without changing existing seats', () => {
  const g = newGame('TEST', 'Host');
  g.sandbox = true;
  const host = { id: 'host', host: true };
  for (let i = 0; i < 15; i++) {
    const previous = g.players.map((p) => p.avatar);
    execute(g, host, { action: 'addDummy', name: `Player ${i}` }, i);
    assert.deepEqual(
      g.players.slice(0, -1).map((p) => p.avatar),
      previous,
    );
    assert.equal(
      new Set(g.players.map((p) => p.avatar)).size,
      g.players.length,
    );
  }
});
