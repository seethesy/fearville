import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute, tick } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
function setup() {
  const g = newGame('VOTING', 'Host');
  g.players = Array.from({ length: 5 }, (_, i) =>
    newPlayer('Voter ' + i, i + 1),
  );
  g.phase = 'voting';
  g.deadline = 100000;
  g.nominationRemaining = 60;
  g.active = {
    id: 'ballot',
    by: g.players[1].id,
    target: g.players[0].id,
    threshold: 3,
    votes: {},
  };
  return g;
}
void test('public votes close immediately after all eligible non-nominees answer', () => {
  const g = setup();
  g.players[4].alive = false;
  g.players[4].ghost = false;
  g.players[3].alive = false;
  for (const i of [1, 2])
    execute(
      g,
      { id: g.players[i].id, host: false },
      { action: 'vote', yes: i === 1, ballot: 'ballot' },
      100,
    );
  const v = view(g, { id: g.players[0].id, host: false }, 1, 100);
  assert.equal(v.active?.votes[g.players[1].id], true);
  assert.equal(v.active?.votes[g.players[2].id], false);
  assert.equal(
    v.controls.some((c) => c.action === 'vote'),
    false,
  );
  assert.equal(g.phase, 'voting');
  execute(
    g,
    { id: g.players[3].id, host: false },
    { action: 'vote', yes: false, ballot: 'ballot' },
    200,
  );
  assert.equal(g.active, null);
  assert.equal(g.phase, 'nomination');
  assert.equal(g.deadline, 60200);
  assert.equal(g.players[3].ghost, true);
  assert.equal(
    view(g, { id: g.players[0].id, host: false }, 2, 200).ballots[0].votes[
      g.players[1].id
    ],
    true,
  );
});
void test('nominee and stale ballots are rejected; waiting ballots keep their timer', () => {
  const g = setup();
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[0].id, host: false },
        { action: 'vote', yes: true },
        1,
      ),
    /eligible/,
  );
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[1].id, host: false },
        { action: 'vote', yes: true, ballot: 'old' },
        1,
      ),
    /changed/,
  );
  assert.equal(tick(g, 500), false);
  tick(g, 100000);
  assert.equal(g.active, null);
  assert.equal(g.ballots[0].count, 0);
});
void test('departed players do not delay completion or contribute votes', () => {
  const g = setup();
  g.players[4].departed = true;
  g.active!.votes[g.players[4].id] = true;
  for (const i of [1, 2, 3])
    execute(
      g,
      { id: g.players[i].id, host: false },
      { action: 'vote', yes: false },
      100,
    );
  assert.equal(g.active, null);
  assert.equal(g.ballots[0].count, 0);
});
