import test from 'node:test';
import assert from 'node:assert/strict';
import { canApplyLatest, canApplyUnchangedEdit } from '../lib/game/concurrency.ts';
import { execute, tasks } from '../lib/game/engine.ts';
import { controls } from '../lib/game/view.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';

const host = { id: 'host', host: true };

void test('only safe Storyteller actions can use the latest table state', () => {
  assert.equal(canApplyLatest(host, { action: 'pause', phaseToken: '1:1:night' }), true);
  assert.equal(canApplyLatest(host, { action: 'night', task: 'doctor:p1', night: 1 }), true);
  assert.equal(canApplyLatest(host, { action: 'resolveDeath', death: 'death-1' }), true);
  assert.equal(canApplyLatest(host, { action: 'nightSkip' }), false);
  assert.equal(canApplyLatest(host, { action: 'night', task: '' }), false);
  assert.equal(canApplyLatest(host, { action: 'pause' }), false);
  assert.equal(canApplyLatest(host, { action: 'edit' }), false);
  assert.equal(canApplyLatest(host, { action: 'start' }), false);
  assert.equal(canApplyLatest({ id: 'player', host: false }, { action: 'pause', phaseToken: '1:1:night' }), false);
  assert.equal(canApplyLatest({ id: 'player', host: false }, { action: 'nominate', target: 'p2' }), true);
  assert.equal(canApplyLatest({ id: 'player', host: false }, { action: 'researcherDeclare' }), true);
});

void test('a deferred or skipped task cannot silently switch targets', () => {
  const g = newGame('TASK', 'Host');
  g.players = ['sheriff', 'teacher', 'judge', 'basilisk', 'monster'].map((id, index) => ({
    ...newPlayer(`P${index + 1}`, index + 1), role: id, shown: id,
  }));
  execute(g, host, { action: 'start', override: true }, 1);
  g.nightChoiceDeadline = 2;
  const current = tasks(g).find((task) => !task.done)!;
  assert.throws(() => execute(g, host, { action: 'nightDefer', task: 'other-task' }, 2), /active night task changed/);
  assert.throws(() => execute(g, host, { action: 'nightSkip', task: 'other-task' }, 3), /active night task changed/);
  execute(g, host, { action: 'nightDefer', task: current.key }, 4);
  assert.notEqual(tasks(g).find((task) => !task.done)?.key, current.key);
});

void test('a stale seat edit can follow unrelated changes without overwriting another edit', () => {
  const g = newGame('EDIT', 'Host');
  g.players = ['sheriff', 'teacher', 'judge', 'basilisk', 'monster'].map((id, index) => ({
    ...newPlayer(`P${index + 1}`, index + 1), role: id, shown: id,
  }));
  const player = g.players[0];
  const edit = controls(g, host).find((control) => control.action === 'edit' && control.fields[0]?.value === player.id)!;
  const base = Object.fromEntries(edit.fields.map((field) => [field.key, field.value ?? '']));
  const command = { action: 'edit', player: player.id, base };
  g.day = 2;
  assert.equal(canApplyUnchangedEdit(g, host, command), true);
  player.notes = 'A newer Storyteller note';
  assert.equal(canApplyUnchangedEdit(g, host, command), false);
  assert.equal(canApplyUnchangedEdit(g, { id: player.id, host: false }, command), false);
});

void test('a timer correction cannot carry into a later phase', () => {
  const g = newGame('TIMER', 'Host');
  g.phase = 'discussion';
  g.day = 2;
  g.night = 2;
  g.deadline = 120000;
  assert.throws(
    () => execute(g, host, { action: 'extend', seconds: 30, phaseToken: '1:1:discussion' }, 10),
    /phase changed/,
  );
  execute(g, host, { action: 'extend', seconds: 30, phaseToken: '2:2:discussion' }, 11);
  assert.equal(g.deadline, 150000);
});
