import test from 'node:test';
import assert from 'node:assert/strict';
import { beginNight, execute, tasks } from '../lib/game/engine.ts';
import { newGame, newPlayer, type Game } from '../lib/game/types.ts';
import { controls, view } from '../lib/game/view.ts';

const host = { id: 'host', host: true };

function horrors(roles: string[]) {
  const g = newGame('QOL', 'Storyteller');
  g.players = roles.map((role, index) => ({
    ...newPlayer(`P${index + 1}`, index + 1),
    role,
    shown: role,
  }));
  return g;
}

void test('pre-deal popup contains editable script decisions and a rules override', () => {
  const defaults = horrors([
    'sheriff',
    'teacher',
    'judge',
    'drunk',
    'hag',
    'basilisk',
    'monster',
  ]);
  defaults.players[3].shown = 'drunk';
  const defaultStart = controls(defaults, host).find(
    (control) => control.action === 'start',
  )!;
  assert.ok(
    defaultStart.fields
      .filter((field) => field.key.startsWith('bluff'))
      .every((field) => field.value),
  );
  assert.ok(
    defaultStart.fields.find(
      (field) => field.key === `shown_${defaults.players[3].id}`,
    )?.value,
  );

  const g = horrors([
    'sheriff',
    'teacher',
    'judge',
    'drunk',
    'hag',
    'basilisk',
    'monster',
  ]);
  g.players[3].shown = 'doctor';
  g.bluffs = ['watchman', 'bodyguard', 'hunter'];
  const start = controls(g, host).find(
    (control) => control.action === 'start',
  )!;
  assert.ok(start.fields.some((field) => field.key === 'bluff1'));
  assert.ok(
    start.fields.some((field) => field.key === `shown_${g.players[3].id}`),
  );
  assert.ok(start.fields.some((field) => field.key === 'override' && field.type === 'checkbox'));
  assert.ok(!start.fields.some((field) => field.key === 'reason'));
  execute(
    g,
    host,
    {
      action: 'start',
      override: true,
      bluff1: 'watchman',
      bluff2: 'bodyguard',
      bluff3: 'vigilante',
      [`shown_${g.players[3].id}`]: 'doctor',
    },
    10,
  );
  assert.equal(g.phase, 'night');
});

void test('night task UI hides its task selector, shows statuses, and defers privately', () => {
  const g = horrors(['sheriff', 'drunk', 'hag', 'basilisk', 'monster']);
  g.players[1].shown = 'teacher';
  g.bluffs = ['doctor', 'watchman', 'bodyguard'];
  execute(g, host, { action: 'start', override: true }, 1);
  g.nightChoiceDeadline = 2;
  const first = tasks(g).find((task) => !task.done)!;
  const initialMessages = g.messages.length;
  const gameView = view(g, host, 1, 3);
  const night = gameView.controls.find(
    (control) => control.action === 'night',
  )!;
  assert.equal(
    night.fields.find((field) => field.key === 'task')?.type,
    'hidden',
  );
  assert.ok(gameView.nightConfirmation?.ability);
  assert.ok(
    gameView.nightConfirmation?.statuses.some(
      (status) => status.name === 'Poisoned' && !status.active,
    ),
  );
  assert.ok(
    gameView.controls.some((control) => control.action === 'nightDefer'),
  );
  execute(g, host, { action: 'nightDefer' }, 3);
  assert.notEqual(tasks(g).find((task) => !task.done)!.key, first.key);
  assert.equal(g.messages.length, initialMessages);
  assert.ok(
    !g.log.some((entry) => entry.public && /set aside/i.test(entry.text)),
  );
});

void test('day confirmation automatically executes the ballot leader and checks wins', () => {
  const g = horrors(['sheriff', 'teacher', 'judge', 'basilisk', 'monster']);
  g.phase = 'dayReview';
  g.day = 1;
  g.ballots = [
    {
      id: 'ballot',
      by: g.players[1].id,
      target: g.players[0].id,
      votes: {},
      threshold: 3,
      count: 3,
    },
  ];
  const finish = controls(g, host).find(
    (control) => control.action === 'finishDay',
  )!;
  assert.deepEqual(finish.fields, []);
  execute(g, host, { action: 'finishDay' }, 5);
  execute(g, host, { action: 'resolveDeath', death: g.hms!.deathQueue[0].id }, 6);
  execute(g, host, { action: 'finishDay' }, 7);
  assert.equal(g.players[0].alive, false);
  assert.equal(g.execution, g.players[0].id);
  assert.equal(g.phase, 'night');
});

void test('Storyteller override controls never ask for a reason', () => {
  const g: Game = horrors(['sheriff', 'teacher', 'judge', 'basilisk', 'monster']);
  beginNight(g, 1);
  assert.ok(
    controls(g, host)
      .flatMap((control) => control.fields)
      .every((field) => field.key !== 'reason'),
  );
});
