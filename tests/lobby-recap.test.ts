import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute, tasks } from '../lib/game/engine.ts';
import { view } from '../lib/game/view.ts';
const host = { id: 'host', host: true };
function setup() {
  const g = newGame('RECAPS', 'Storyteller');
  g.sandbox = true;
  g.players = ['sheriff', 'teacher', 'judge', 'basilisk', 'monster'].map(
    (r, i) => ({ ...newPlayer(`Player ${i + 1}`, i + 1), role: r, shown: r }),
  );
  return g;
}
const actor = (id: string) => ({ id, host: false });
void test('all eighteen players can claim distinct seats; seat nineteen remains invalid', () => {
  const g = newGame('FULL', 'Storyteller');
  g.players = Array.from({ length: 18 }, (_, i) =>
    newPlayer(`Player ${i + 1}`, 0),
  );
  for (const [i, player] of g.players.entries())
    execute(g, actor(player.id), { action: 'claimSeat', seat: i + 1 }, i);
  assert.deepEqual(
    g.players.map((player) => player.seat),
    Array.from({ length: 18 }, (_, i) => i + 1),
  );
  execute(g, actor(g.players[17].id), { action: 'leaveSeat' }, 20);
  assert.throws(
    () =>
      execute(
        g,
        actor(g.players[17].id),
        { action: 'claimSeat', seat: 19 },
        21,
      ),
    /valid seat/,
  );
});
function finished() {
  const g = setup();
  execute(g, host, { action: 'start' }, 1000);
  execute(g, host, { action: 'end', winner: 'good' }, 65000);
  return g;
}
void test('claiming seats never moves someone else and leaving retains membership and appearance', () => {
  const g = setup();
  const p = g.players[0],
    q = g.players[1];
  p.seat = 0;
  p.avatar = 'avatar-01';
  execute(g, actor(p.id), { action: 'claimSeat', seat: 8, player: q.id }, 1);
  assert.equal(p.seat, 8);
  assert.equal(q.seat, 2);
  assert.throws(
    () => execute(g, actor(q.id), { action: 'claimSeat', seat: 8 }, 2),
    /Leave your current/,
  );
  execute(g, actor(q.id), { action: 'leaveSeat' }, 3);
  assert.throws(
    () => execute(g, actor(q.id), { action: 'claimSeat', seat: 8 }, 4),
    /just claimed/,
  );
  execute(g, actor(p.id), { action: 'leaveSeat' }, 5);
  assert.equal(p.seat, 0);
  assert.equal(p.avatar, 'avatar-01');
  assert.ok(g.players.includes(p));
  assert.throws(
    () => execute(g, host, { action: 'claimSeat', seat: 1 }, 6),
    /own seats/,
  );
  for (const seat of [0, 19, 1.2])
    assert.throws(
      () => execute(g, actor(p.id), { action: 'claimSeat', seat }, 7),
      /valid seat/,
    );
});
void test('roles cannot be dealt with unseated players; gaps compact in clockwise order on start', () => {
  const g = setup();
  g.players[0].seat = 0;
  assert.throws(
    () =>
      execute(
        g,
        host,
        { action: 'start', override: true, reason: 'Try bypass' },
        1000,
      ),
    /claim a seat/,
  );
  execute(g, actor(g.players[0].id), { action: 'claimSeat', seat: 15 }, 2);
  execute(g, host, { action: 'start' }, 1000);
  assert.equal(g.players.at(-1)?.name, 'Player 1');
  assert.deepEqual(
    g.players.map((p) => p.seat),
    [1, 2, 3, 4, 5],
  );
  assert.throws(
    () => execute(g, actor(g.players[0].id), { action: 'leaveSeat' }, 3),
    /lobby/,
  );
});
void test('elapsed time freezes at victory and remains frozen across polls and return', () => {
  const g = finished();
  const first = view(g, host, 1, 90000).recaps[0];
  const second = view(g, host, 1, 190000).recaps[0];
  assert.equal(first.started, 1000);
  assert.equal(first.ended, 65000);
  assert.equal(second.ended, first.ended);
  execute(g, host, { action: 'returnLobby' }, 200000);
  assert.equal(g.recaps?.[0].ended, 65000);
  assert.equal(g.gameStartedAt, undefined);
  assert.equal(g.gameEndedAt, undefined);
});
void test('MVP votes enforce eligibility, no self-votes, one player vote and three distinct host votes', () => {
  const g = finished();
  const ids = g.players.map((p) => p.id);
  const recap = view(g, host, 1, 70000).recaps[0].id;
  const vote = (who: typeof host, player: string) =>
    execute(g, who, { action: 'mvpVote', player, recap }, 70000);
  assert.throws(() => vote(actor(ids[0]), ids[0]), /yourself/);
  assert.throws(() => vote(actor('stranger'), ids[0]), /no longer/);
  assert.throws(() => vote(host, 'missing'), /Choose a player/);
  vote(actor(ids[0]), ids[1]);
  assert.throws(() => vote(actor(ids[0]), ids[2]), /all your MVP/);
  vote(host, ids[0]);
  assert.throws(() => vote(host, ids[0]), /already voted/);
  vote(host, ids[1]);
  vote(host, ids[2]);
  assert.throws(() => vote(host, ids[3]), /all your MVP/);
  const v = view(g, actor(ids[0]), 2, 75000).recaps[0];
  assert.equal(v.mvpCounts[ids[1]], 2);
  assert.deepEqual(v.myVotes, [ids[1]]);
  assert.ok(!('votes' in v));
});
void test('another player returning does not close voting or duplicate a recap', () => {
  const g = finished(),
    ids = g.players.map((p) => p.id);
  const recap = view(g, host, 1, 70000).recaps[0].id;
  execute(g, actor(ids[0]), { action: 'returnLobby', recap }, 70000);
  execute(
    g,
    actor(ids[1]),
    { action: 'mvpVote', recap, player: ids[0] },
    71000,
  );
  execute(g, actor(ids[1]), { action: 'returnLobby', recap }, 72000);
  assert.equal(g.recaps?.length, 1);
  assert.equal(view(g, host, 1, 80000).recaps[0].mvpCounts[ids[0]], 1);
  const outsider = newPlayer('New arrival', 0);
  g.players.push(outsider);
  assert.throws(
    () =>
      execute(
        g,
        actor(outsider.id),
        { action: 'mvpVote', recap, player: ids[0] },
        80000,
      ),
    /participants/,
  );
});
void test('notes and direct messages stay private during play and are revealed only in completed recaps', () => {
  const g = setup(),
    ids = g.players.map((p) => p.id);
  execute(g, host, { action: 'start' }, 1000);
  const notebook = {
    text: 'Secret suspicion',
    roles: { monster: 2 },
    players: {},
  };
  execute(
    g,
    actor(ids[0]),
    { action: 'saveNotebook', started: 1000, notebook },
    2000,
  );
  execute(
    g,
    actor(ids[0]),
    { action: 'chat', to: 'host', text: 'Secret message' },
    3000,
  );
  for (const who of [host, actor(ids[1])]) {
    const v = view(g, who, 1, 4000);
    assert.equal(v.notebook, null);
    assert.equal(v.recaps.length, 0);
  }
  assert.equal(view(g, actor(ids[0]), 1, 4000).notebook?.text, notebook.text);
  execute(g, host, { action: 'end', winner: 'evil' }, 5000);
  const recap = view(g, actor(ids[1]), 1, 6000).recaps[0];
  assert.equal(recap.players[0].notebook?.text, notebook.text);
  assert.ok(recap.messages?.some((m) => m.text === 'Secret message'));
  execute(g, host, { action: 'returnLobby' }, 7000);
  execute(
    g,
    actor(ids[0]),
    {
      action: 'saveNotebook',
      started: 1000,
      notebook: { ...notebook, text: 'Last keystroke' },
    },
    8000,
  );
  assert.equal(g.recaps?.[0].players[0].notebook?.text, 'Last keystroke');
  assert.equal(g.notebooks, undefined);
});
void test('recap activity links night targets and effects to both actor and target', () => {
  const g = setup();
  execute(g, host, { action: 'start' }, 1000);
  const basilisk = g.players[3],
    target = g.players[0];
  const task = tasks(g).find((t) => t.role === 'basilisk')!;
  execute(
    g,
    host,
    { action: 'night', task: task.key, target: target.id },
    2000,
  );
  const event = g.decisions?.at(-1);
  assert.ok(event?.playerIds?.includes(basilisk.id));
  assert.ok(event?.playerIds?.includes(target.id));
  assert.match(event?.text ?? '', /fears/);
});
void test('multiple rounds retain independent numbered recaps, votes and notes', () => {
  const g = finished(),
    ids = g.players.map((p) => p.id);
  execute(g, host, { action: 'returnLobby' }, 70000);
  execute(g, host, { action: 'randomAssign' }, 80000);
  execute(g, host, { action: 'start' }, 90000);
  const before = view(g, host, 1, 95000).recaps;
  assert.equal(before.length, 1);
  execute(g, host, { action: 'end', winner: 'evil' }, 100000);
  const recaps = view(g, actor(ids[0]), 1, 110000).recaps;
  assert.deepEqual(
    recaps.map((r) => r.number),
    [1, 2],
  );
  assert.notEqual(recaps[0].id, recaps[1].id);
  assert.equal(recaps[0].winner, 'Good');
  assert.equal(recaps[1].winner, 'Evil');
  assert.equal(recaps[1].started, 90000);
  assert.throws(
    () =>
      execute(g, host, { action: 'returnLobby', recap: recaps[0].id }, 110000),
    /different game/,
  );
});
void test('rewinding victory removes current recap and starts a fresh end timestamp', () => {
  const g = finished();
  execute(g, host, { action: 'undo' }, 80000);
  assert.notEqual(g.phase, 'ended');
  assert.equal(g.gameEndedAt, undefined);
  assert.equal(view(g, host, 1, 90000).recaps.length, 0);
  execute(g, host, { action: 'end', winner: 'evil' }, 100000);
  assert.equal(view(g, host, 1, 200000).recaps[0].ended, 100000);
});

void test('manually reopening a finished game also resets its duration endpoint and MVP votes', () => {
  const g = finished();
  const recap = view(g, host, 1, 70000).recaps[0].id;
  execute(
    g,
    host,
    { action: 'mvpVote', recap, player: g.players[0].id },
    70000,
  );
  execute(
    g,
    host,
    {
      action: 'overridePhase',
      phase: 'discussion',
      override: true,
      reason: 'Reopen game',
    },
    80000,
  );
  assert.equal(g.gameEndedAt, undefined);
  assert.equal(g.mvpVotes, undefined);
  execute(g, host, { action: 'end', winner: 'evil' }, 100000);
  assert.equal(view(g, host, 1, 200000).recaps[0].ended, 100000);
});
