import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import {
  execute,
  tasks,
  beginNight,
  nightChoiceTask,
} from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
function setup(roles = ['poisoner', 'fortuneteller', 'monk', 'butler', 'imp']) {
  const g = newGame('CHOICE', 'Host');
  g.players = roles.map((r, i) => ({
    ...newPlayer('Player ' + (i + 1), i + 1),
    role: r,
    shown: r,
  }));
  beginNight(g, 1);
  return g;
}
function choose(g: ReturnType<typeof setup>, target: string, target2?: string) {
  const t = nightChoiceTask(g)!;
  execute(
    g,
    { id: t.player, host: false },
    { action: 'nightChoice', task: t.key, round: t.round, target, target2 },
    2,
  );
  return g.nightChoices![t.key];
}
void test('first-night choice is private, prefills host, and has no effect before confirmation', () => {
  const g = setup();
  const t = nightChoiceTask(g)!;
  const choice = choose(g, g.players[1].id);
  assert.equal(g.players[1].poisoned, false);
  assert.equal(g.done.length, 0);
  assert.equal(g.log.filter((l) => l.public).length, 1);
  const hostView = view(g, host, 1, 1);
  assert.equal(hostView.nightConfirmation?.choice?.target, g.players[1].id);
  assert.equal(
    hostView.controls
      .find((c) => c.action === 'night')
      ?.fields.find((f) => f.key === 'target')?.value,
    g.players[1].id,
  );
  const other = view(g, { id: g.players[1].id, host: false }, 1, 1);
  assert.equal(other.nightChoice?.count, 2);
  assert.equal(other.nightChoice?.choice, null);
  assert.equal(other.nightConfirmation, null);
  assert.equal(
    view(g, { id: t.player, host: false }, 1, 1).nightChoice?.choice?.id,
    choice.id,
  );
  execute(
    g,
    host,
    {
      action: 'night',
      task: t.key,
      choiceId: choice.id,
      target: choice.target,
    },
    60002,
  );
  assert.equal(g.players[1].poisoned, true);
});
void test('rejects other players, stale rounds, completed tasks, self selections and duplicate pairs', () => {
  const g = setup();
  const t = nightChoiceTask(g)!;
  const c = {
    action: 'nightChoice',
    task: t.key,
    round: t.round,
    target: g.players[1].id,
  };
  assert.throws(
    () => execute(g, { id: g.players[1].id, host: false }, c, 2),
    /no longer available/,
  );
  assert.throws(
    () => execute(g, { id: t.player, host: false }, { ...c, round: 'old' }, 2),
    /no longer available/,
  );
  g.done.push(t.key);
  assert.throws(
    () => execute(g, { id: t.player, host: false }, c, 2),
    /no longer available/,
  );
  assert.throws(
    () => choose(g, g.players[0].id, g.players[0].id),
    /two different/,
  );
  choose(g, g.players[0].id, g.players[4].id);
  g.done.push(nightChoiceTask(g)!.key);
  assert.equal(nightChoiceTask(g)?.role, 'butler');
  assert.throws(() => choose(g, g.players[3].id), /eligible/);
});
void test('changed choices cannot be confirmed with an outdated choice id', () => {
  const g = setup();
  const t = nightChoiceTask(g)!;
  const old = choose(g, g.players[1].id);
  choose(g, g.players[2].id);
  assert.throws(
    () =>
      execute(
        g,
        host,
        { action: 'night', task: t.key, choiceId: old.id, target: old.target },
        60002,
      ),
    /changed their choice/,
  );
  assert.equal(g.players[1].poisoned, false);
});
void test('poison status is host-only and does not require an acknowledgement field', () => {
  const g = setup(['monk', 'chef', 'soldier', 'baron', 'imp']);
  beginNight(g, 2);
  g.players[0].poisoned = true;
  const t = nightChoiceTask(g)!;
  const choice = choose(g, g.players[1].id);
  const v = view(g, host, 1, 1);
  assert.equal(v.nightConfirmation?.poisoned, true);
  assert.ok(
    v.nightConfirmation?.statuses.some(
      (s) => s.name === 'Poisoned' && s.active,
    ),
  );
  assert.ok(
    !v.controls
      .find((c) => c.action === 'night')
      ?.fields.some((f) => f.key === 'poisonAcknowledged'),
  );
  const c = {
    action: 'night',
    task: t.key,
    choiceId: choice.id,
    target: choice.target,
  };
  execute(g, host, c, 60003);
  assert.equal(g.players[1].protected, false);
  assert.equal(
    view(g, { id: g.players[0].id, host: false }, 2, 4).nightConfirmation,
    null,
  );
});
void test('night reset clears choices and Drunk follows shown target ability', () => {
  const g = setup();
  choose(g, g.players[1].id);
  beginNight(g, 2);
  assert.deepEqual(g.nightChoices, {});
  const drunk = setup(['drunk', 'chef', 'soldier', 'baron', 'imp']);
  drunk.players[0].shown = 'fortuneteller';
  drunk.done = tasks(drunk)
    .filter((t) => t.role !== 'fortuneteller')
    .map((t) => t.key);
  assert.equal(nightChoiceTask(drunk)?.count, 2);
});
void test('information-only roles have no target prompt; Ravenkeeper activates after night death', () => {
  const g = setup(['washerwoman', 'chef', 'ravenkeeper', 'baron', 'imp']);
  assert.equal(nightChoiceTask(g), null);
  beginNight(g, 2);
  g.players[2].alive = false;
  g.players[2].nightDeath = 2;
  g.done = tasks(g)
    .filter((t) => t.role !== 'ravenkeeper')
    .map((t) => t.key);
  assert.equal(nightChoiceTask(g)?.player, g.players[2].id);
  assert.ok(view(g, { id: g.players[2].id, host: false }, 1, 1).nightChoice);
});

void test('night windows prompt all eligible players together and enforce the server deadline', () => {
  const g = setup();
  for (const index of [0, 1, 3])
    assert.ok(
      view(g, { id: g.players[index].id, host: false }, 1, 2).nightChoice,
    );
  assert.equal(
    view(g, { id: g.players[2].id, host: false }, 1, 2).nightChoice,
    null,
  ); // Monk does not act first night.
  const p = g.players[1];
  const prompt = view(g, { id: p.id, host: false }, 1, 2).nightChoice!;
  const command = {
    action: 'nightChoice',
    task: prompt.task,
    round: prompt.round,
    target: g.players[0].id,
    target2: g.players[2].id,
  };
  execute(g, { id: p.id, host: false }, command, 60000);
  assert.throws(
    () => execute(g, { id: p.id, host: false }, command, 60001),
    /timer has ended/,
  );
  assert.equal(view(g, { id: p.id, host: false }, 1, 60001).nightChoice, null);
  assert.throws(
    () => execute(g, host, { action: 'nightSkip' }, 60000),
    /timer to finish/,
  );
  assert.ok(g.nightChoices?.[prompt.task]);
});
void test('only the Horror receives exact Haunt roles in the target list', () => {
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
    'Poisoner',
  );
  assert.ok(
    horror.options
      .filter((p) => p.id !== g.players[0].id)
      .every((p) => !p.knownRole),
  );
  const good = view(
    g,
    { id: g.players[1].id, host: false },
    1,
    101,
  ).nightChoice!;
  assert.ok(good.options.every((p) => !p.knownRole));
  assert.ok(
    view(g, { id: g.players[4].id, host: false }, 1, 101).players.every(
      (p) => !('role' in p),
    ),
  );
});
void test('Ravenkeeper preselects conditionally without announcing death, and custom durations apply next night', () => {
  const g = setup(['poisoner', 'ravenkeeper', 'monk', 'butler', 'imp']);
  g.timers.nightChoice = 90;
  beginNight(g, 100);
  assert.equal(g.nightChoiceDeadline, 90100);
  const player = { id: g.players[1].id, host: false };
  assert.equal(view(g, player, 1, 101).nightChoice?.conditional, true);
  g.players[1].alive = false;
  g.players[1].nightDeath = g.night;
  assert.equal(view(g, player, 1, 101).players[1].alive, true);
  assert.equal(view(g, player, 1, 101).nightChoice?.conditional, true);
});

void test('night target lists and submissions exclude ineligible seats', () => {
  const g = setup();
  g.players[2].alive = false;
  g.players[2].publicAlive = false;
  beginNight(g, 100);
  for (const index of [0, 4]) {
    const actor = { id: g.players[index].id, host: false };
    const prompt = view(g, actor, 1, 101).nightChoice!;
    assert.ok(!prompt.options.some((p) => p.id === g.players[2].id));
    assert.throws(
      () =>
        execute(
          g,
          actor,
          {
            action: 'nightChoice',
            task: prompt.task,
            round: prompt.round,
            target: g.players[2].id,
          },
          101,
        ),
      /eligible/,
    );
  }
  const butler = view(
    g,
    { id: g.players[3].id, host: false },
    1,
    101,
  ).nightChoice!;
  assert.ok(!butler.options.some((p) => p.id === g.players[3].id));
});
