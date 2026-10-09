import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { renameMember, removeMember } from '../lib/game/membership.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
function setup() {
  const g = newGame('MEMBER', 'Host');
  g.players = [
    newPlayer('Alice', 1),
    newPlayer('Bob', 2),
    newPlayer('Carol', 3),
  ];
  return g;
}
void test('players can rename only themselves and names remain unique', () => {
  const g = setup();
  const actor = { id: g.players[0].id, host: false };
  renameMember(g, actor, ' New Alice ', 1);
  assert.equal(g.players[0].name, 'New Alice');
  assert.throws(() => renameMember(g, actor, 'bob', 2), /taken/);
  assert.throws(() => renameMember(g, actor, ' ', 2), /1–32/);
  renameMember(g, host, 'New Host', 2);
  assert.equal(g.hostName, 'New Host');
});
void test('removal closes rewind paths and preserves other claimed seats', () => {
  const g = setup();
  const actor = { id: g.players[0].id, host: false };
  assert.throws(() => removeMember(g, actor, g.players[1].id, 1), /own seat/);
  g.redHerring = g.players[1].id;
  removeMember(g, host, g.players[1].id, 1);
  assert.deepEqual(
    g.players.map((p) => p.seat),
    [1, 3],
  );
  assert.equal(g.redHerring, '');
  assert.deepEqual(g.history, []);
});
void test('departed active characters stay in the game but cannot act or receive messages', () => {
  const g = setup();
  g.phase = 'night';
  const p = g.players[0];
  p.role = 'imp';
  removeMember(g, { id: p.id, host: false }, p.id, 1);
  assert.equal(g.players.length, 3);
  assert.equal(p.role, 'imp');
  assert.ok(p.alive && p.departed);
  assert.throws(
    () =>
      execute(
        g,
        { id: p.id, host: false },
        { action: 'chat', text: 'unauthorized' },
        2,
      ),
    /no longer/,
  );
  assert.throws(
    () => execute(g, host, { action: 'chat', to: p.id, text: 'message' }, 2),
    /recipient/,
  );
});
void test('direct messages are private and retry identifiers prevent duplicate sends', () => {
  const g = setup();
  const messageId = crypto.randomUUID();
  const c = {
    action: 'chat',
    to: g.players[0].id,
    text: 'Private instructions',
    messageId,
  };
  execute(g, host, c, 1);
  execute(g, host, c, 2);
  assert.equal(g.messages.length, 1);
  assert.equal(
    view(g, { id: g.players[1].id, host: false }, 1, 2).messages.length,
    0,
  );
  assert.equal(
    view(g, { id: g.players[0].id, host: false }, 1, 2).messages.length,
    1,
  );
  assert.throws(
    () => execute(g, host, { ...c, text: 'Changed' }, 3),
    /already used/,
  );
});
