import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import { returnToLobby } from '../lib/game/lobby.ts';
import { validAvatar, defaultAvatar, AVATARS } from '../lib/game/avatars.ts';
import { PORTRAIT_FRAMES, DEATH_EFFECTS } from '../lib/game/cosmetics.ts';

void test('cosmetics are validated atomically, public, and preserved between rounds', () => {
  const g = newGame('TEST', 'Host');
  g.players = [newPlayer('Ada', 1), newPlayer('Bea', 2)];
  const actor = { id: g.players[0].id, host: false };
  for (const frame of PORTRAIT_FRAMES) {
    for (const effect of DEATH_EFFECTS) {
      execute(
        g,
        actor,
        {
          action: 'setAvatar',
          avatar: 'moon',
          portraitFrame: frame.id,
          deathEffect: effect.id,
        },
        1,
      );
      const p = view(g, { id: g.players[1].id, host: false }, 1, 1).players[0];
      assert.equal(p.portraitFrame, frame.id);
      assert.equal(p.deathEffect, effect.id);
    }
  }
  const before = structuredClone(g.players[0]);
  for (const invalid of [
    { portraitFrame: 'bogus' },
    { deathEffect: 'bogus' },
    { portraitFrame: null },
  ]) {
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
  assert.equal(g.players[0].portraitFrame, before.portraitFrame);
  returnToLobby(g, 4);
  assert.equal(g.players[0].portraitFrame, before.portraitFrame);
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
  g.players = [newPlayer('Ada', 1), newPlayer('Bea', 2)];
  const actor = { id: g.players[0].id, host: false };
  execute(
    g,
    actor,
    { action: 'setAvatar', avatar: 'raven', player: g.players[1].id },
    1,
  );
  assert.equal(g.players[0].avatar, 'raven');
  assert.equal(g.players[1].avatar, undefined);
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
  g.players = [newPlayer('Ada', 1), newPlayer('Bea', 2)];
  g.phase = 'night';
  g.players[1].alive = false;
  const actor = { id: g.players[0].id, host: false };
  execute(g, actor, { action: 'setAvatar', avatar: 'eye' }, 1);
  const result = view(g, actor, 1, 1);
  assert.equal(result.players[1].alive, true);
  assert.equal(result.dawnAnnouncement, null);
  assert.ok(result.players.every((p) => !('role' in p)));
});
