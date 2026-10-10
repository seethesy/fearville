import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../lib/game/engine.ts';
import { newGame } from '../lib/game/types.ts';
import { newSandboxGame } from '../lib/game/sandbox.ts';
import { view } from '../lib/game/view.ts';

const host = { id: 'host', host: true };

void test('new Sandbox lobbies start with six distinct dummy seats', () => {
  const game = newSandboxGame('SANDBX', 'Tester');
  assert.equal(game.players.length, 6);
  assert.deepEqual(
    game.players.map((player) => player.seat),
    [1, 2, 3, 4, 5, 6],
  );
  assert.ok(game.players.every((player) => player.dummy));
  assert.equal(new Set(game.players.map((player) => player.avatar)).size, 6);
});

void test('Sandbox adds dummy players, disables timers, and supports private POVs', () => {
  const g = newGame('SANDBX', 'Tester');
  g.sandbox = true;
  for (let i = 1; i <= 5; i++)
    execute(g, host, { action: 'addDummy', name: `Dummy ${i}` }, i);
  assert.ok(g.players.every((p) => p.dummy));
  execute(g, host, { action: 'randomAssign' }, 10);
  execute(
    g,
    host,
    {
      action: 'configure',
      bluff1: g.bluffs[0],
      bluff2: g.bluffs[1],
      bluff3: g.bluffs[2],
      redHerring: g.redHerring,
    },
    15,
  );
  execute(g, host, { action: 'start' }, 20);
  assert.equal(g.deadline, null);
  const player = g.players[0];
  const playerView = view(g, { id: player.id, host: false }, 1, 30, true);
  assert.equal(playerView.sandbox, true);
  assert.equal(playerView.sandboxHost, true);
  assert.equal(playerView.host, false);
  assert.equal(playerView.me, player.id);
  assert.ok(playerView.character);
  assert.equal(playerView.deadline, null);
  assert.equal(playerView.nightChoiceDeadline, null);
  const hostView = view(g, host, 1, 30, true);
  assert.ok(
    !hostView.controls.some((c) =>
      ['pause', 'resume', 'extend'].includes(c.action),
    ),
  );
});

void test('completed games return to the same lobby with seats and a recap', () => {
  const g = newGame('LOBBYY', 'Tester');
  g.sandbox = true;
  for (let i = 1; i <= 5; i++)
    execute(g, host, { action: 'addDummy', name: `Dummy ${i}` }, i);
  const ids = g.players.map((p) => p.id);
  execute(g, host, { action: 'randomAssign' }, 10);
  execute(g, host, { action: 'start' }, 20);
  g.decisions = [
    { id: 'decision', at: 25, actor: 'Dummy 1', text: 'Selected Dummy 2.' },
  ];
  execute(g, host, { action: 'end', winner: 'good' }, 30);
  const ended = view(g, host, 2, 31, true);
  assert.equal(ended.recaps.length, 1);
  assert.equal(ended.recaps[0].players.length, 5);
  assert.equal(ended.recaps[0].decisions[0].actor, 'Dummy 1');
  assert.ok(ended.controls.some((c) => c.action === 'returnLobby'));

  execute(
    g,
    { id: g.players[0].id, host: false },
    { action: 'returnLobby' },
    40,
  );
  assert.equal(g.phase, 'lobby');
  assert.deepEqual(
    g.players.map((p) => p.id),
    ids,
  );
  assert.ok(g.players.every((p) => p.role === '' && p.alive));
  assert.equal(g.recaps?.length, 1);
  assert.equal(g.recaps?.[0].winner, 'Good');
});
