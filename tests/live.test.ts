import test from 'node:test';
import assert from 'node:assert/strict';
import { newestView } from '../lib/game/live.ts';
const current = { code: 'TABLEA', me: 'player', version: 12, serverNow: 2000 };
void test('late polling responses cannot roll back new action results', () => {
  assert.equal(
    newestView(current, { ...current, version: 11, serverNow: 2100 }),
    current,
  );
  assert.equal(newestView(current, { ...current, serverNow: 1000 }), current);
  const next = { ...current, version: 13, serverNow: 2100 };
  assert.equal(newestView(current, next), next);
});
void test('initial connections and restored identities accept their current view', () => {
  assert.equal(newestView(null, current), current);
  const restored = { ...current, code: 'TABLEB', version: 1 };
  assert.equal(newestView(current, restored), restored);
  const otherSeat = { ...current, me: 'host', version: 1 };
  assert.equal(newestView(current, otherSeat), otherSeat);
});
