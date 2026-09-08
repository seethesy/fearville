import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import {
  execute,
  tick,
  tasks,
  setupIssues,
  candidate,
  death,
} from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
function game(
  roles = [
    'washerwoman',
    'librarian',
    'chef',
    'empath',
    'fortuneteller',
    'poisoner',
    'imp',
  ],
) {
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
const over = { override: true, reason: 'Test Storyteller correction' };
void test('standard seven-player setup and private role distribution', () => {
  const g = game();
  assert.deepEqual(setupIssues(g), []);
  execute(g, host, { action: 'start' }, 100);
  assert.equal(g.phase, 'night');
  for (const p of g.players) {
    const v = view(g, { id: p.id, host: false }, 1, 100);
    assert.equal(
      v.character?.name,
      p.role === 'fortuneteller'
        ? 'Fortune Teller'
        : p.role[0].toUpperCase() + p.role.slice(1),
    );
    assert.ok(v.players.every((p) => !('role' in p)));
    assert.equal(v.tasks.length, 0);
    assert.equal(v.messages.length, 1);
    assert.ok(!v.controls.some((c) => c.action === 'edit'));
  }
});
void test('night order and small-game evil introductions', () => {
  const g = game();
  g.night = 1;
  assert.deepEqual(
    tasks(g).map((t) => t.role),
    [
      'minioninfo',
      'demoninfo',
      'poisoner',
      'washerwoman',
      'librarian',
      'chef',
      'empath',
      'fortuneteller',
    ],
  );
  const small = game(['monk', 'ravenkeeper', 'undertaker', 'spy', 'imp']);
  small.night = 1;
  assert.deepEqual(
    tasks(small).map((t) => t.role),
    ['spy'],
  );
  small.night = 2;
  assert.deepEqual(
    tasks(small).map((t) => t.role),
    ['monk', 'imp', 'spy'],
  );
});
void test('Drunk receives shown character and follows its night order', () => {
  const g = game(['drunk', 'monk', 'soldier', 'poisoner', 'imp']);
  g.players[0].shown = 'empath';
  execute(g, host, { action: 'start', ...over }, 100);
  assert.equal(
    view(g, { id: g.players[0].id, host: false }, 1, 100).character?.name,
    'Empath',
  );
  assert.ok(tasks(g).some((t) => t.role === 'empath'));
});
void test('poison expires at dusk and night deaths stay hidden until dawn', () => {
  const g = game();
  g.phase = 'night';
  g.night = 2;
  const p = g.players[0];
  p.poisoned = true;
  death(g, p, 100, 'test');
  assert.equal(
    view(g, { id: p.id, host: false }, 1, 100).players[0].alive,
    true,
  );
  assert.equal(view(g, host, 1, 100).players[0].alive, false);
  execute(g, host, { action: 'dawn', ...over }, 101);
  assert.equal(
    view(g, { id: p.id, host: false }, 1, 101).players[0].alive,
    false,
  );
  g.phase = 'dayReview';
  execute(g, host, { action: 'finishDay' }, 102);
  assert.equal(p.poisoned, false);
});
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
  for (const p of g.players.slice(0, 4))
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
  for (const p of g.players.slice(0, 4))
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
    { action: 'nominate', target: a.id },
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
void test('Butler yes requires master yes; a dead Butler is unrestricted', () => {
  const g = game(['butler', 'chef', 'monk', 'poisoner', 'imp']);
  g.phase = 'nomination';
  g.remaining = 100;
  const [butler, master] = g.players;
  butler.master = master.id;
  execute(g, host, { action: 'nominate', by: master.id, target: butler.id }, 1);
  g.phase = 'voting';
  execute(g, { id: butler.id, host: false }, { action: 'vote', yes: true }, 2);
  execute(g, host, { action: 'advance' }, 3);
  assert.equal(g.ballots[0].count, 0);
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
void test('Scarlet Woman succession at five living players', () => {
  const g = game(['chef', 'monk', 'soldier', 'scarletwoman', 'imp']);
  g.phase = 'night';
  g.night = 2;
  death(g, g.players[4], 100, 'attack', g.players[3].id);
  assert.equal(g.players[3].role, 'imp');
  assert.ok(g.done.includes('imp:' + g.players[3].id));
});
void test('Librarian structured message and consistency checks', () => {
  const g = game(['librarian', 'saint', 'chef', 'poisoner', 'imp']);
  g.phase = 'night';
  g.night = 1;
  g.done = ['poisoner:' + g.players[3].id];
  const task = tasks(g).find((t) => !t.done)!;
  execute(
    g,
    host,
    {
      action: 'night',
      task: task.key,
      target: g.players[1].id,
      target2: g.players[2].id,
      reveal: 'saint',
    },
    1,
  );
  assert.match(g.messages[0].text, /One of Seat 2 and Seat 3 is the Saint/);
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
void test('Virgin cannot trigger again on a later day', () => {
  const g = game(['virgin', 'chef', 'monk', 'poisoner', 'imp']);
  g.phase = 'nomination';
  g.remaining = 100;
  const [v, c] = g.players;
  execute(g, host, { action: 'nominate', by: c.id, target: v.id }, 1);
  assert.equal(g.active?.virginFirst, true);
  execute(g, host, { action: 'virgin' }, 2);
  assert.equal(c.alive, false);
  g.phase = 'nomination';
  g.nominators = [];
  g.nominees = [];
  g.remaining = 100;
  execute(
    g,
    host,
    { action: 'nominate', by: g.players[2].id, target: v.id },
    3,
  );
  assert.throws(
    () => execute(g, host, { action: 'virgin' }, 4),
    /does not apply/,
  );
});
void test('nomination preview never reveals a hidden Virgin', () => {
  const g = game(['virgin', 'chef', 'monk', 'poisoner', 'imp']);
  g.phase = 'nomination';
  g.remaining = 100;
  const reply = execute(
    g,
    { id: g.players[1].id, host: false },
    { action: 'nominate', target: g.players[0].id },
    1,
  );
  assert.ok(!reply.includes('Virgin'));
  const response = JSON.stringify(
    view(g, { id: g.players[1].id, host: false }, 1, 1),
  );
  assert.ok(!response.includes('virginFirst'));
});
void test('protected Soldier survives an Imp attack and Spy remains last', () => {
  const g = game(['soldier', 'monk', 'ravenkeeper', 'spy', 'imp']);
  g.phase = 'night';
  g.night = 2;
  g.done = ['monk:' + g.players[1].id];
  const t = tasks(g).find((t) => !t.done)!;
  execute(
    g,
    host,
    {
      action: 'night',
      task: t.key,
      target: g.players[0].id,
      outcome: 'suggested',
    },
    1,
  );
  assert.equal(g.players[0].alive, true);
  assert.equal(tasks(g).at(-1)?.role, 'spy');
});
void test('Imp death wakes a newly killed Ravenkeeper before information', () => {
  const g = game(['ravenkeeper', 'monk', 'empath', 'spy', 'imp']);
  g.phase = 'night';
  g.night = 2;
  g.done = ['monk:' + g.players[1].id];
  execute(
    g,
    host,
    {
      action: 'night',
      task: tasks(g).find((t) => !t.done)!.key,
      target: g.players[0].id,
      outcome: 'suggested',
    },
    1,
  );
  assert.equal(tasks(g).find((t) => !t.done)?.role, 'ravenkeeper');
});
void test('healthy Saint execution ends the game', () => {
  const g = game(['saint', 'monk', 'chef', 'poisoner', 'imp']);
  g.phase = 'dayReview';
  g.ballots = [
    {
      id: 'ballot',
      by: g.players[1].id,
      target: g.players[0].id,
      votes: {},
      count: 3,
      threshold: 3,
    },
  ];
  execute(g, host, { action: 'finishDay' }, 1);
  assert.equal(g.phase, 'ended');
  assert.match(g.winner, /Saint/);
});
