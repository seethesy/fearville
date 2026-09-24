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
  assert.equal(other.nightChoice, null);
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
    3,
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
        3,
      ),
    /changed their choice/,
  );
  assert.equal(g.players[1].poisoned, false);
});
void test('poison warning is host-only and requires acknowledgement to confirm', () => {
  const g = setup(['monk', 'chef', 'soldier', 'baron', 'imp']);
  beginNight(g, 2);
  g.players[0].poisoned = true;
  const t = nightChoiceTask(g)!;
  const choice = choose(g, g.players[1].id);
  const v = view(g, host, 1, 1);
  assert.equal(v.nightConfirmation?.poisoned, true);
  assert.ok(
    v.controls
      .find((c) => c.action === 'night')
      ?.fields.some((f) => f.key === 'poisonAcknowledged'),
  );
  const c = {
    action: 'night',
    task: t.key,
    choiceId: choice.id,
    target: choice.target,
  };
  assert.throws(() => execute(g, host, c, 3), /poisoned/);
  execute(g, host, { ...c, poisonAcknowledged: true }, 4);
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
