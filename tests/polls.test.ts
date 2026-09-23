import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer, type Game } from '../lib/game/types.ts';
import { beginNight, execute, setPhase } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
import { NIGHT_QUESTIONS } from '../lib/game/polls.ts';
const host = { id: 'host', host: true };
function setup() {
  const g = newGame('POLLED', 'Host');
  g.players = ['washerwoman', 'imp', 'drunk', 'ravenkeeper', 'soldier'].map(
    (role, i) => ({
      ...newPlayer('Player ' + i, i + 1),
      role,
      shown: role === 'drunk' ? 'empath' : role,
    }),
  );
  beginNight(g, 100);
  return g;
}
function answer(g: Game, i: number, target: number) {
  return execute(
    g,
    { id: g.players[i].id, host: false },
    {
      action: 'nightPoll',
      poll: g.nightPoll!.id,
      target: g.players[target].id,
    },
    200,
  );
}
void test('all seated players get the same stable question without revealing roles or deaths', () => {
  const g = setup();
  assert.ok(NIGHT_QUESTIONS.includes(g.nightPoll!.question));
  g.players[3].alive = false;
  g.players[4].alive = false;
  g.players[4].publicAlive = false;
  for (const p of g.players) {
    const v = view(g, { id: p.id, host: false }, 1, 100);
    assert.equal(v.nightPoll?.question, g.nightPoll!.question);
    assert.ok(v.controls.some((c) => c.action === 'nightPoll'));
    assert.equal(v.previousNightPoll, null);
  }
  assert.equal(view(g, host, 1, 100).nightPoll, null);
});
void test('answers are private, replaceable, and never add log, chat or history entries', () => {
  const g = setup();
  const before = [g.messages.length, g.log.length, g.history.length];
  answer(g, 0, 1);
  answer(g, 0, 2);
  assert.equal(Object.keys(g.nightPoll!.answers).length, 1);
  assert.equal(
    view(g, { id: g.players[0].id, host: false }, 1, 100).nightPoll?.answer,
    g.players[2].id,
  );
  assert.equal(
    view(g, { id: g.players[1].id, host: false }, 1, 100).nightPoll?.answer,
    null,
  );
  for (const actor of [host, { id: g.players[1].id, host: false }]) {
    const v = view(g, actor, 1, 100);
    assert.equal(v.previousNightPoll, null);
    assert.ok(!JSON.stringify(v).includes('answers'));
  }
  assert.deepEqual([g.messages.length, g.log.length, g.history.length], before);
});
void test('dawn publishes favorites and ties only, then the next night resets answers', () => {
  const g = setup();
  answer(g, 0, 1);
  answer(g, 1, 1);
  answer(g, 2, 2);
  answer(g, 3, 2);
  const old = structuredClone(g.nightPoll!);
  setPhase(g, 'discovery', 300);
  assert.deepEqual(g.previousNightPoll?.winners, ['Player 1', 'Player 2']);
  assert.deepEqual(Object.keys(g.previousNightPoll!).sort(), [
    'night',
    'question',
    'winners',
  ]);
  assert.equal(view(g, host, 1, 300).previousNightPoll?.night, 1);
  assert.throws(() => answer(g, 0, 0), /closed/);
  beginNight(g, 400);
  assert.notEqual(g.nightPoll!.question, old.question);
  assert.notEqual(g.nightPoll!.id, old.id);
  assert.deepEqual(g.nightPoll!.answers, {});
  assert.equal(view(g, host, 1, 400).previousNightPoll?.night, 1);
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[0].id, host: false },
        {
          action: 'nightPoll',
          poll: old.id,
          target: g.players[0].id,
        },
        500,
      ),
    /changed/,
  );
});
void test('host, unseated users and invalid targets cannot answer; empty polls close', () => {
  const g = setup();
  const c = {
    action: 'nightPoll',
    poll: g.nightPoll!.id,
    target: g.players[0].id,
  };
  assert.throws(() => execute(g, host, c, 200), /seated/);
  assert.throws(
    () => execute(g, { id: 'stranger', host: false }, c, 200),
    /not found/,
  );
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[0].id, host: false },
        { ...c, target: 'stranger' },
        200,
      ),
    /not found/,
  );
  setPhase(g, 'discovery', 300);
  assert.deepEqual(g.previousNightPoll?.winners, []);
});
void test('rewind restores poll state and removes results published after the saved decision', () => {
  const g = setup();
  answer(g, 0, 1);
  execute(
    g,
    host,
    { action: 'overridePhase', phase: 'discovery', reason: 'Test dawn' },
    300,
  );
  assert.ok(g.previousNightPoll);
  execute(g, host, { action: 'undo' }, 400);
  assert.equal(g.phase, 'night');
  assert.equal(g.previousNightPoll, undefined);
  assert.equal(g.nightPoll!.answers[g.players[0].id], g.players[1].id);
});
void test('older saved games without poll fields remain readable', () => {
  const g = setup();
  delete g.nightPoll;
  assert.equal(
    view(g, { id: g.players[0].id, host: false }, 1, 100).nightPoll,
    null,
  );
  beginNight(g, 200);
  assert.ok(g.nightPoll);
});
