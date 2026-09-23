import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import {
  deriveResult,
  gameID,
  winnerOf,
  normalizeHandle,
  validStars,
  text,
} from '../lib/social/derive.ts';

const host = { id: 'host', host: true };
function game(roles: string[]) {
  const g = newGame('ABCDEF', 'Host');
  g.players = roles.map((r, i) => ({
    ...newPlayer('Seat ' + (i + 1), i + 1),
    role: r,
    shown: r,
  }));
  g.bluffs = ['monk', 'soldier', 'mayor'];
  g.redHerring = g.players[0].id;
  return g;
}

void test('nothing is recorded before a game ends or for an abandoned lobby', () => {
  const g = game(['washerwoman', 'librarian', 'chef', 'poisoner', 'imp']);
  assert.equal(deriveResult(g, 1, 2), null);
  execute(g, host, { action: 'end', winner: 'good' }, 100);
  assert.equal(g.phase, 'ended');
  assert.equal(deriveResult(g, 1, 2), null, 'ended from the lobby');
});

void test('a finished game records final alignment, roles, and the winner', () => {
  const g = game(['washerwoman', 'librarian', 'chef', 'poisoner', 'imp']);
  execute(g, host, { action: 'start' }, 100);
  g.players[2].alive = false;
  execute(g, host, { action: 'end', winner: 'evil' }, 200);
  const record = deriveResult(g, 50, 200);
  assert.ok(record);
  assert.equal(record.id, gameID('ABCDEF', 50));
  assert.equal(record.winner, 'evil');
  assert.equal(record.reason, 'Evil');
  assert.equal(record.players, 5);
  assert.equal(record.nights, 1);
  assert.deepEqual(
    record.seats.map((s) => [s.role, s.team, s.won, s.alive]),
    [
      ['washerwoman', 'good', false, true],
      ['librarian', 'good', false, true],
      ['chef', 'good', false, false],
      ['poisoner', 'evil', true, true],
      ['imp', 'evil', true, true],
    ],
  );
});

void test('the Drunk records as good and a promoted Minion records as the Imp', () => {
  const g = game(['drunk', 'librarian', 'chef', 'scarletwoman', 'imp']);
  g.players[0].shown = 'monk';
  execute(
    g,
    host,
    { action: 'start', override: true, reason: 'Test Storyteller ruling' },
    100,
  );
  g.players[3].role = 'imp';
  g.players[4].alive = false;
  execute(g, host, { action: 'end', winner: 'good' }, 200);
  const record = deriveResult(g, 1, 200);
  assert.ok(record);
  assert.equal(record.seats[0].role, 'drunk');
  assert.equal(record.seats[0].team, 'good');
  assert.equal(record.seats[0].won, true);
  assert.equal(record.seats[3].role, 'imp');
  assert.equal(record.seats[3].won, false);
});

void test('winner labels with rulings still map to a team', () => {
  assert.equal(winnerOf('Evil · Saint execution'), 'evil');
  assert.equal(winnerOf('Good'), 'good');
  assert.equal(winnerOf(''), null);
});

void test('handles are normalized and validated', () => {
  assert.equal(normalizeHandle('@Art_Fan9 '), 'art_fan9');
  assert.throws(() => normalizeHandle('ab'));
  assert.throws(() => normalizeHandle('has space'));
  assert.throws(() => normalizeHandle('storyteller'));
  assert.throws(() => normalizeHandle({ toString: () => 'object' }));
  assert.equal(text({ a: 1 }), '');
  assert.equal(text('  padded  ', 3), 'pad');
});

void test('ratings accept whole stars from one to five', () => {
  assert.equal(validStars('4'), 4);
  assert.throws(() => validStars(0));
  assert.throws(() => validStars(2.5));
  assert.throws(() => validStars(6));
});
