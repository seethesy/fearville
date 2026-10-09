import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
void test('new tables use requested default phase times and 30-second Add Time', () => {
  const g = lobby();
  assert.deepEqual(g.timers, {
    nightChoice: 60,
    discovery: 180,
    discussion: 120,
    nomination: 60,
    defense: 60,
    voting: 60,
  });
  g.phase = 'discussion';
  assert.equal(
    view(g, host, 1, 1).controls.find((c) => c.action === 'extend')?.fields[0]
      .value,
    30,
  );
});
function lobby(count = 7) {
  const g = newGame('ASSIGN', 'Host');
  g.players = Array.from({ length: count }, (_, i) =>
    newPlayer('Player ' + i, i + 1),
  );
  return g;
}
void test('preview and commit assign identical roles; a new deal rotates the seed', () => {
  const g = lobby();
  const original = structuredClone(g);
  const preview = structuredClone(g);
  const description = execute(preview, host, { action: 'randomAssign' }, 100);
  assert.deepEqual(g, original);
  assert.equal(execute(g, host, { action: 'randomAssign' }, 101), description);
  assert.deepEqual(g.players, preview.players);
  assert.deepEqual(g.bluffs, preview.bluffs);
  assert.equal(g.redHerring, preview.redHerring);
  assert.notEqual(g.assignmentSeed, original.assignmentSeed);
  execute(g, host, { action: 'undo' }, 102);
  assert.deepEqual(g.players, original.players);
  assert.equal(g.assignmentSeed, original.assignmentSeed);
});
void test('manual assignment works before and after random assignment without revealing roles', () => {
  const g = lobby();
  const p = g.players[0];
  const edit = {
    action: 'edit',
    player: p.id,
    name: p.name,
    seat: 1,
    role: 'sheriff',
    alive: true,
    ghost: true,
  };
  execute(g, host, edit, 100);
  assert.equal(p.role, 'sheriff');
  execute(g, host, { action: 'randomAssign' }, 101);
  execute(g, host, { ...edit, role: 'drunk', shown: 'watchman' }, 102);
  assert.equal(p.role, 'drunk');
  assert.equal(p.shown, 'watchman');
  assert.equal(g.messages.length, 0);
  const v = view(g, { id: p.id, host: false }, 1, 103);
  assert.equal(v.character, null);
  assert.ok(v.players.every((p) => !('role' in p)));
  assert.ok(
    !v.controls.some((c) => ['randomAssign', 'edit'].includes(c.action)),
  );
  assert.ok(
    view(g, host, 1, 103).controls.some((c) => c.action === 'randomAssign'),
  );
});
void test('only the Storyteller may randomize, only in a supported lobby', () => {
  const g = lobby();
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[0].id, host: false },
        { action: 'randomAssign' },
        100,
      ),
    /Storyteller/,
  );
  for (const count of [0, 4, 19])
    assert.throws(
      () => execute(lobby(count), host, { action: 'randomAssign' }, 100),
      /5–18/,
    );
  execute(g, host, { action: 'randomAssign' }, 100);
  execute(g, host, { action: 'start' }, 101);
  assert.throws(
    () => execute(g, host, { action: 'randomAssign' }, 102),
    /lobby/,
  );
});
void test('older lobbies without a saved seed still have stable previews', () => {
  const g = lobby();
  delete g.assignmentSeed;
  assert.equal(
    execute(structuredClone(g), host, { action: 'randomAssign' }, 100),
    execute(structuredClone(g), host, { action: 'randomAssign' }, 101),
  );
});
