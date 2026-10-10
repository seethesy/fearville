import test from 'node:test';
import assert from 'node:assert/strict';
import { availableAvatar, AVATARS } from '../lib/game/avatars.ts';
import {
  defaultPreferences,
  normalizePreferences,
} from '../lib/accounts/preferences.ts';
void test('preset collisions choose an available icon without changing existing or saved choices', () => {
  const players = [
    { id: 'one', avatar: 'ghost' },
    { id: 'two', avatar: 'raven' },
  ];
  const before = structuredClone(players);
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = availableAvatar('ghost', players);
    assert.ok(AVATARS.some((a) => a.id === result));
    assert.ok(!players.some((p) => p.avatar === result));
  }
  assert.deepEqual(players, before);
  assert.equal(availableAvatar('moon', players), 'moon');
});
void test('photo defaults can repeat and a full preset pool fails explicitly', () => {
  const photo = 'data:image/jpeg;base64,/9j/AA==';
  assert.equal(availableAvatar(photo, [{ id: 'photo', avatar: photo }]), photo);
  assert.throws(
    () =>
      availableAvatar(
        'ghost',
        AVATARS.map((a) => ({ id: a.id, avatar: a.id })),
      ),
    /No preset/,
  );
});
void test('preferences normalize partial input without accepting invalid volumes or booleans', () => {
  assert.deepEqual(normalizePreferences({}), defaultPreferences);
  assert.equal(normalizePreferences({ music: 12.7 }).music, 13);
  for (const value of [-1, 101, NaN, Infinity, '50'])
    assert.throws(() => normalizePreferences({ sfx: value }), /Volume/);
  assert.throws(
    () => normalizePreferences({ reducedMotion: 'false' }),
    /settings/,
  );
  assert.equal(normalizePreferences({ showOnline: false }).showOnline, false);
  assert.equal(defaultPreferences.showOnline, true);
});
