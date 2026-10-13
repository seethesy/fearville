import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { nextDeadline, tick, setPhase } from '../lib/game/engine.ts';
import {
  beginRiteNight,
  configureRite,
  tickRite,
  riteAction,
} from '../lib/rite/engine.ts';
import type { BoardState, LabState } from '../lib/rite/types.ts';

void test('a fake clock alarm advances every phase without a client poll', () => {
  const g = newGame('ALARMS', 'Host');
  g.timers.discussion = 2;
  g.timers.nomination = 3;
  setPhase(g, 'discovery', 1000, 1);
  assert.equal(nextDeadline(g), 2000);
  assert.equal(tick(g, 1999), false);
  assert.equal(tick(g, 2000), true);
  assert.equal(g.phase, 'discussion');
  assert.equal(nextDeadline(g, 2000), 4000);
  tick(g, 4000);
  assert.equal(g.phase, 'nomination');
  tick(g, 7000);
  assert.equal(g.phase, 'dayReview');
  assert.equal(nextDeadline(g, 7000), null);
});
void test('night choices wake once per deadline; paused and sandbox tables have no game alarm', () => {
  const g = newGame('ALARMS', 'Host');
  g.phase = 'night';
  g.nightChoiceDeadline = 5000;
  g.nightChoiceTasks = [
    { key: 'a', role: 'doctor', player: 'a', name: 'A', done: false },
  ];
  g.nightChoiceDeadlines = { a: 2000 };
  assert.equal(nextDeadline(g), 2000);
  assert.equal(nextDeadline(g, 2000), 5000);
  assert.equal(nextDeadline(g, 5000), null);
  g.sandbox = true;
  assert.equal(nextDeadline(g), null);
  g.sandbox = false;
  g.phase = 'discussion';
  g.deadline = null;
  assert.equal(nextDeadline(g), null);
});
function rite(kind: 'board' | 'lab', timed = true) {
  const g = newGame('ALARMS', 'Host');
  g.players = Array.from({ length: 3 }, (_, i) => ({
    ...newPlayer(`P${i}`, i + 1),
    role: 'watchman',
  }));
  configureRite(g, {
    action: 'configureRite',
    config: { enabled: true, timed, patterns: [kind], lockSeconds: 1 },
  });
  tickRite(g, 0);
  g.phase = 'night';
  g.night = 2;
  beginRiteNight(g, 1000);
  return g;
}
void test('Escape Fearville hands turns off on exact 5-second deadlines and catches up with no polling', () => {
  const g = rite('board'),
    s = g.rite!.squads[0],
    state = s.state as BoardState;
  assert.equal(nextDeadline(g), 2000); // initial character window
  assert.equal(state.turn!.deadline, 7000);
  tick(g, 7000);
  assert.equal(state.turn!.cursor, 1);
  assert.equal(state.turn!.deadline, 12000);
  tick(g, 22000);
  assert.equal(state.turn!.cursor, 1); // four handoffs total
  assert.equal(state.turn!.deadline, 27000);
  assert.equal(nextDeadline(g, 22000), 27000);
  assert.equal(g.rite!.windowEnd, 92000);
  const untimed = rite('board', false);
  assert.equal(untimed.rite!.windowEnd, undefined);
  assert.equal(nextDeadline(untimed), null);
});
void test('a laboratory ballot expires without answers and resumes the next timed turn', () => {
  const g = rite('lab'),
    s = g.rite!.squads[0],
    state = s.state as LabState,
    t = state.turn!;
  riteAction(
    g,
    { id: t.order[0], host: false },
    {
      action: 'riteLabCall',
      kind: 'reset',
      turn: t.token,
      epoch: g.rite!.epoch,
      night: 2,
    },
    2000,
  );
  assert.equal(nextDeadline(g, 2000), 17000);
  tick(g, 17000);
  assert.equal(t.vote, undefined);
  assert.equal(t.voteResult?.passed, false);
  assert.equal(t.cursor, 1);
  assert.equal(t.deadline, 22000);
});
