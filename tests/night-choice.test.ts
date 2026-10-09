import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { beginNight, execute, nightChoiceTask } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
function setup() {
  const g = newGame('CHOICE', 'Host');
  g.players = ['basilisk', 'detective', 'doctor', 'watchman', 'monster'].map(
    (r, i) => ({ ...newPlayer('Player ' + (i + 1), i + 1), role: r, shown: r }),
  );
  beginNight(g, 1);
  return g;
}
function command(g: ReturnType<typeof setup>, index = 0) {
  const task = nightChoiceTask(g, g.players[index].id)!;
  return {
    action: 'nightChoice',
    task: task.key,
    round: task.round,
    target: g.players[3].id,
  };
}
void test('private choices prefill the host and apply only after current-choice confirmation', () => {
  const g = setup(),
    actor = { id: g.players[0].id, host: false };
  const c = command(g);
  execute(g, actor, c, 2);
  const old = g.nightChoices![c.task];
  assert.equal(!!g.players[3].feared, false);
  assert.equal(view(g, host, 1, 2).nightConfirmation?.choice?.id, old.id);
  assert.equal(
    view(g, { id: g.players[1].id, host: false }, 1, 2).nightChoice?.choice,
    null,
  );
  execute(g, actor, { ...c, target: g.players[2].id }, 3);
  assert.throws(
    () =>
      execute(
        g,
        host,
        { action: 'night', task: c.task, choiceId: old.id, target: old.target },
        60002,
      ),
    /changed their choice/,
  );
  const current = g.nightChoices![c.task];
  execute(
    g,
    host,
    {
      action: 'night',
      task: c.task,
      choiceId: current.id,
      target: current.target,
    },
    60003,
  );
  assert.equal(g.players[2].feared, true);
});
void test('choice authorization, stale rounds, duplicate pairs and deadlines are server checked', () => {
  const g = setup(),
    p = g.players[0],
    c = command(g);
  assert.throws(
    () => execute(g, { id: g.players[1].id, host: false }, c, 2),
    /no longer available/,
  );
  assert.throws(
    () => execute(g, { id: p.id, host: false }, { ...c, round: 'old' }, 2),
    /no longer available/,
  );
  const pair = command(g, 1);
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[1].id, host: false },
        { ...pair, target2: pair.target },
        2,
      ),
    /different/,
  );
  assert.throws(
    () => execute(g, { id: p.id, host: false }, c, 60001),
    /timer has ended/,
  );
  assert.throws(
    () => execute(g, host, { action: 'nightSkip' }, 2),
    /timer to finish/,
  );
});
void test('new nights clear choices and the Drunk follows its shown ability', () => {
  const g = setup();
  execute(g, { id: g.players[0].id, host: false }, command(g), 2);
  g.players[3].role = 'drunk';
  g.players[3].shown = 'detective';
  beginNight(g, 100);
  assert.deepEqual(g.nightChoices, {});
  assert.equal(nightChoiceTask(g, g.players[3].id)?.count, 2);
});
void test('only the Horror learns Haunt roles; choice lists reject departed seats', () => {
  const g = setup();
  beginNight(g, 100);
  const horror = view(
    g,
    { id: g.players[4].id, host: false },
    1,
    101,
  ).nightChoice!;
  assert.equal(
    horror.options.find((p) => p.id === g.players[0].id)?.knownRole,
    'Basilisk',
  );
  assert.ok(
    view(
      g,
      { id: g.players[1].id, host: false },
      1,
      101,
    ).nightChoice!.options.every((p) => !p.knownRole),
  );
  g.players[3].departed = true;
  const c = command(g);
  assert.ok(
    !nightChoiceTask(g, g.players[0].id)!.options.some(
      (p) => p.id === c.target,
    ),
  );
  assert.throws(
    () => execute(g, { id: g.players[0].id, host: false }, c, 101),
    /eligible/,
  );
});
