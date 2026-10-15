// FEAR-121: when an open page reloads after a deploy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inGame,
  isNewerBuild,
  reloadDecision,
  safeToReload,
} from '../lib/compat/stale.ts';

const client = { buildId: 'aaa', apiVersion: 1 };
void test('outside a game reload now; mid-game wait; protocol bumps reload immediately', () => {
  assert.equal(reloadDecision({ buildId: 'aaa' }, client, true), 'none');
  assert.equal(reloadDecision({ buildId: 'bbb' }, client, false), 'now');
  assert.equal(reloadDecision({ buildId: 'bbb' }, client, true), 'safe');
  assert.equal(reloadDecision({ apiVersion: 2 }, client, true), 'immediate');
  assert.equal(
    reloadDecision({ buildId: 'aaa', apiVersion: 1 }, client, true),
    'none',
  );
  // Local and unversioned builds never trigger reloads.
  assert.equal(isNewerBuild('development', 'aaa'), false);
  assert.equal(isNewerBuild('bbb', 'development'), false);
  assert.equal(isNewerBuild(undefined, 'aaa'), false);
});

void test('a safe moment is the next phase change while the player is not mid-action', () => {
  const at = (phaseKey: string, busy = false, editing = false) =>
    safeToReload({ phaseKey, pendingSince: 'day:2:1', busy, editing });
  assert.equal(at('day:2:1'), false);
  assert.equal(at('night:2:2'), true);
  assert.equal(at('night:2:2', true), false);
  assert.equal(at('night:2:2', false, true), false);
  assert.equal(inGame('lobby'), false);
  assert.equal(inGame('ended'), false);
  assert.equal(inGame('night'), true);
  assert.equal(inGame(undefined), false);
});
