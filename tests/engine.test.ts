import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute, tick, candidate } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
void test('Storyteller can assign and swap script roles in the lobby', () => {
  const g = newGame('ASSIGN', 'Host');
  g.players = [newPlayer('Ada', 1), newPlayer('Ben', 2)];
  const [ada, ben] = g.players;
  assert.throws(
    () => execute(g, { id: ada.id, host: false }, { action: 'assignRole', player: ben.id, role: 'doctor' }, 1),
    /Storyteller/,
  );
  assert.throws(
    () => execute(g, host, { action: 'assignRole', player: ada.id, role: 'werewolf' }, 1),
    /this script/,
  );
  execute(g, host, { action: 'assignRole', player: ada.id, role: 'doctor' }, 2);
  execute(g, host, { action: 'assignRole', player: ben.id, role: 'monster' }, 3);
  execute(g, host, { action: 'assignRole', player: ben.id, role: 'doctor' }, 4);
  assert.equal(ada.role, 'monster');
  assert.equal(ben.role, 'doctor');
  assert.equal(ben.shown, 'doctor');
  g.phase = 'night';
  assert.throws(
    () => execute(g, host, { action: 'assignRole', player: ada.id, role: 'teacher' }, 5),
    /lobby/,
  );
});
function game(
  roles = [
    'sheriff',
    'hoflibrarian',
    'teacher',
    'judge',
    'lostwanderer',
    'basilisk',
    'monster',
  ],
) {
  const g = newGame('ABCDEF', 'Host');
  g.players = roles.map((r, i) => ({
    ...newPlayer('Seat ' + (i + 1), i + 1),
    role: r,
    shown: r,
  }));
  g.bluffs = ['doctor', 'watchman', 'bodyguard'];
  g.redHerring = g.players[0].id;
  return g;
}
void test('timers catch up after disconnect and pause prevents advancement', () => {
  const g = game();
  g.phase = 'discovery';
  g.deadline = 1000;
  g.remaining = 300;
  assert.equal(tick(g, 1000), true);
  assert.equal(g.phase, 'discussion');
  execute(g, host, { action: 'pause' }, 2000);
  const left = g.remaining;
  tick(g, 9999999);
  assert.equal(g.phase, 'discussion');
  execute(g, host, { action: 'resume' }, 10000000);
  assert.equal(g.deadline, 10000000 + left * 1000);
});
void test('nomination restrictions, self nomination, threshold and tie', () => {
  const g = game();
  g.phase = 'nomination';
  g.remaining = 120;
  const [a, b, c] = g.players;
  execute(
    g,
    { id: a.id, host: false },
    { action: 'nominate', target: a.id },
    100,
  );
  assert.equal(g.active?.threshold, 4);
  g.phase = 'voting';
  for (const p of g.players
    .filter((p) => p.id !== g.active?.target)
    .slice(0, 4))
    execute(g, { id: p.id, host: false }, { action: 'vote', yes: true }, 110);
  execute(g, host, { action: 'advance' }, 120);
  assert.equal(candidate(g).target, a.id);
  assert.throws(
    () =>
      execute(
        g,
        { id: a.id, host: false },
        { action: 'nominate', target: b.id },
        125,
      ),
    /already nominated/,
  );
  execute(
    g,
    { id: b.id, host: false },
    { action: 'nominate', target: c.id },
    130,
  );
  g.phase = 'voting';
  for (const p of g.players
    .filter((p) => p.id !== g.active?.target)
    .slice(0, 4))
    execute(g, { id: p.id, host: false }, { action: 'vote', yes: true }, 140);
  execute(g, host, { action: 'advance' }, 150);
  assert.equal(candidate(g).tied, true);
  assert.equal(candidate(g).target, '');
});
void test('dead players cannot nominate and have one counted yes vote', () => {
  const g = game();
  g.phase = 'nomination';
  g.remaining = 120;
  const [a, b] = g.players;
  a.alive = false;
  a.publicAlive = false;
  assert.throws(
    () =>
      execute(
        g,
        { id: a.id, host: false },
        { action: 'nominate', target: b.id },
        1,
      ),
    /Dead players/,
  );
  execute(
    g,
    { id: b.id, host: false },
    { action: 'nominate', target: b.id },
    2,
  );
  g.phase = 'voting';
  execute(g, { id: a.id, host: false }, { action: 'vote', yes: false }, 3);
  assert.equal(a.ghost, true);
  execute(g, { id: a.id, host: false }, { action: 'vote', yes: true }, 4);
  assert.equal(a.ghost, true);
  execute(g, host, { action: 'advance' }, 5);
  assert.equal(a.ghost, false);
});
void test('private messages are restricted to recipient and Storyteller', () => {
  const g = game();
  execute(
    g,
    host,
    { action: 'chat', to: g.players[0].id, text: 'Secret clue' },
    100,
  );
  const a = view(g, { id: g.players[0].id, host: false }, 1, 100),
    b = view(g, { id: g.players[1].id, host: false }, 1, 100);
  assert.equal(a.messages.length, 1);
  assert.equal(b.messages.length, 0);
  assert.throws(
    () =>
      execute(
        g,
        { id: g.players[1].id, host: false },
        { action: 'end', winner: 'evil' },
        1,
      ),
    /Only the Storyteller/,
  );
});
void test('undo restores game decisions without pretending to unsend information', () => {
  const g = game();
  execute(g, host, { action: 'start' }, 100);
  assert.equal(g.phase, 'night');
  execute(g, host, { action: 'undo' }, 200);
  assert.equal(g.phase, 'lobby');
  assert.ok(g.messages.length > 7);
  assert.equal(g.messages.at(-1)?.kind, 'correction');
});
void test('non-qualifying votes do not cause execution', () => {
  const g = game();
  g.phase = 'dayReview';
  g.ballots = [
    {
      id: '1',
      by: g.players[0].id,
      target: g.players[1].id,
      votes: {},
      threshold: 4,
      count: 3,
    },
  ];
  assert.equal(candidate(g).target, '');
  execute(g, host, { action: 'finishDay' }, 100);
  assert.ok(g.players.every((p) => p.alive));
});
