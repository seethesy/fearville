import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute, tick } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
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
  assert.equal(g.deadline, 90200);
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
void test('abstentions are public responses and timeouts record missing eligible votes', () => {
  const g = setup();
  execute(
    g,
    { id: g.players[1].id, host: false },
    { action: 'vote', yes: null },
    100,
  );
  const v = view(g, { id: g.players[1].id, host: false }, 1, 100);
  assert.equal(v.active?.myVoteSubmitted, true);
  assert.equal(v.active?.votes[g.players[1].id], null);
  tick(g, 100000);
  assert.equal(g.ballots[0].votes[g.players[2].id], null);
  assert.ok(!Object.hasOwn(g.ballots[0].votes, g.players[0].id));
  assert.equal(g.deadline, 190000);
  const all = setup();
  for (const p of all.players.slice(1))
    execute(all, { id: p.id, host: false }, { action: 'vote', yes: null }, 100);
  assert.equal(all.phase, 'nomination');
  assert.equal(all.deadline, 90100);
});
void test('dead players cannot be nominated even by Storyteller override', () => {
  const g = setup();
  g.phase = 'nomination';
  g.active = null;
  g.players[0].alive = false;
  for (const actor of [host, { id: g.players[1].id, host: false }]) {
    const c = view(g, actor, 1, 100).controls.find(
      (c) => c.action === 'nominate',
    )!;
    assert.ok(
      !c.fields
        .find((f) => f.key === 'target')
        ?.options?.some((o) => o.value === g.players[0].id),
    );
    assert.throws(
      () =>
        execute(
          g,
          actor,
          {
            action: 'nominate',
            by: g.players[1].id,
            target: g.players[0].id,
            override: true,
            reason: 'Test',
          },
          100,
        ),
      /Only living/,
    );
  }
});
void test('Storyteller can correct the latest ballot and refund or spend dead votes without extending time again', () => {
  const g = setup();
  g.players[3].alive = false;
  for (const p of g.players.slice(1))
    execute(g, host, { action: 'vote', player: p.id, yes: true }, 100);
  const deadline = g.deadline;
  const c = {
    action: 'correctVote',
    ballot: 'ballot',
    player: g.players[3].id,
    yes: null,
  };
  assert.equal(g.players[3].ghost, false);
  assert.throws(
    () => execute(g, { id: g.players[1].id, host: false }, c, 200),
    /Storyteller/,
  );
  execute(g, host, c, 200);
  assert.equal(g.players[3].ghost, true);
  assert.equal(g.ballots[0].count, 3);
  execute(g, host, { ...c, yes: true }, 300);
  assert.equal(g.players[3].ghost, false);
  assert.equal(g.ballots[0].count, 4);
  assert.equal(g.deadline, deadline);
  assert.equal(g.ballots.length, 1);
  assert.throws(
    () => execute(g, host, { ...c, player: g.players[0].id }, 400),
    /not eligible/,
  );
  assert.ok(
    !(
      'voterState' in
      view(g, { id: g.players[1].id, host: false }, 2, 400).ballots[0]
    ),
  );
});
void test('correcting a master vote also recalculates the Butler vote', () => {
  const g = setup();
  g.players[2].role = 'butler';
  g.players[2].master = g.players[1].id;
  for (const p of g.players.slice(1))
    execute(g, host, { action: 'vote', player: p.id, yes: true }, 100);
  execute(
    g,
    host,
    {
      action: 'correctVote',
      ballot: 'ballot',
      player: g.players[1].id,
      yes: false,
    },
    200,
  );
  assert.equal(g.ballots[0].count, 2);
  assert.deepEqual(g.ballots[0].invalid, [g.players[2].id]);
});
