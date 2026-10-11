import test from 'node:test';
import assert from 'node:assert/strict';
import { beginNight, execute, tasks } from '../lib/game/engine.ts';
import { newGame, newPlayer, type Game } from '../lib/game/types.ts';
import { controls, view } from '../lib/game/view.ts';
import { hms, preventedBy } from '../lib/game/hms.ts';

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
  assert.ok(gameView.nightConfirmation?.statuses.every((status) => !['Poisoned', 'Infected'].includes(status.name)));
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

void test('Storyteller can correct fear from a status bubble and fear disables abilities', () => {
  const g = horrors(['sheriff', 'doctor', 'hag', 'basilisk', 'monster']);
  execute(g, host, { action: 'start', override: true }, 1);
  const doctor = g.players[1];
  const player = { id: doctor.id, host: false };
  assert.throws(() => execute(g, player, { action: 'setPlayerStatus', player: doctor.id, status: 'feared', active: true }, 2), /Storyteller/);
  execute(g, host, { action: 'setPlayerStatus', player: doctor.id, status: 'feared', active: true }, 3);
  assert.equal(doctor.feared, true);
  assert.equal(doctor.poisoned, false);
  g.night = 2;
  g.done = [];
  const doctorTask = tasks(g).find((task) => task.player === doctor.id)!;
  for (const task of tasks(g)) {
    if (task.key === doctorTask.key) break;
    g.done.push(task.key);
  }
  const confirmation = view(g, host, 2, 4).nightConfirmation;
  assert.equal(confirmation?.playerId, doctor.id);
  assert.equal(confirmation?.impaired, true);
  assert.ok(confirmation?.statuses.some((status) => status.key === 'feared' && status.active));
  execute(g, host, { action: 'setPlayerStatus', player: doctor.id, status: 'feared', active: false }, 5);
  assert.equal(doctor.feared, false);
  assert.equal(view(g, host, 3, 5).nightConfirmation?.impaired, false);
  execute(g, host, { action: 'setPlayerStatus', player: doctor.id, status: 'protected', active: true }, 6);
  assert.equal(preventedBy(g, { id: 'manual', player: doctor.id, cause: 'attack', ready: true, night: true }), 'Storyteller protection');
});

void test('Nightmare state bubbles can bind and redirect a player', () => {
  const g = newGame('NIGHTMARE', 'Storyteller');
  g.script = 'holyMoonStars';
  g.phase = 'night';
  g.night = 2;
  g.players = ['mystic', 'astrologist', 'nightmare', 'miasma', 'werewolf'].map((id, index) => ({
    ...newPlayer(`P${index + 1}`, index + 1), role: id, shown: id,
  }));
  hms(g).nightmare = { player: g.players[2].id, bound: '', used: false };
  const subject = g.players[0];
  const target = g.players[1];
  execute(g, host, { action: 'setPlayerStatus', player: subject.id, status: 'haunted', active: true }, 1);
  assert.equal(g.hms?.nightmare?.bound, subject.id);
  execute(g, host, { action: 'setPlayerStatus', player: subject.id, status: 'redirected', active: true, target: target.id }, 2);
  assert.equal(g.hms?.nightmareRedirectTarget, target.id);
  execute(g, host, { action: 'setPlayerStatus', player: subject.id, status: 'redirected', active: false }, 3);
  assert.equal(g.hms?.nightmareRedirectTarget, undefined);
  execute(g, host, { action: 'setPlayerStatus', player: subject.id, status: 'haunted', active: false }, 4);
  assert.equal(g.hms?.nightmare?.bound, '');
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
