import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { execute } from '../lib/game/engine.ts';
import { independentCommand } from '../lib/game/scoped-update.ts';
import {
  configureRite,
  tickRite,
  beginRiteNight,
  riteAction,
} from '../lib/rite/engine.ts';
import { PUZZLE_BANK } from '../lib/rite/bank-data.ts';
import { preparedPuzzle } from '../lib/rite/bank.ts';
import { solveBoard } from '../lib/rite/board.ts';
import { solveLab } from '../lib/rite/lab.ts';
import { controls } from '../lib/game/view.ts';
import { canApplyLatest } from '../lib/game/concurrency.ts';

const fixture = () => {
  const g = newGame('SCOPED', 'Host');
  g.players = Array.from({ length: 6 }, (_, i) => ({
    ...newPlayer(`Player ${i}`, i + 1),
    role: 'watchman',
    shown: 'watchman',
  }));
  g.gameStartedAt = 1;
  return g;
};
void test('different player notes and messages use independent updates with membership guards', () => {
  const before = fixture();
  for (const player of before.players) {
    const actor = { id: player.id, host: false };
    for (const command of [
      {
        action: 'saveNotebook',
        started: 1,
        notebook: { text: 'My private note', roles: {}, players: {} },
      },
      { action: 'chat', text: 'A private message' },
    ]) {
      const after = structuredClone(before);
      execute(after, actor, command, 10);
      const update = independentCommand(before, after, actor, command)!;
      assert.ok(update);
      assert.ok(update.guard.some(([path]) => path === '$.players'));
      assert.ok(
        !update.guard.some(([path]) =>
          ['$.messages', '$.notebooks', '$.history'].includes(path),
        ),
      );
      if (command.action === 'saveNotebook')
        assert.equal(
          update.set[0][0],
          `$.notebooks.${JSON.stringify(player.id)}`,
        );
      else assert.equal(update.append?.[0], '$.messages[#]');
      after.phase = 'night';
      assert.equal(
        independentCommand(before, after, actor, command),
        null,
        'unexpected side effects must use the full transaction',
      );
    }
  }
});
void test('a vigil update guards its own puzzle and phase without locking other vigils', () => {
  const before = fixture();
  configureRite(before, {
    action: 'configureRite',
    config: { enabled: true, patterns: ['board'] },
  });
  tickRite(before, 10);
  before.phase = 'night';
  before.night = 2;
  beginRiteNight(before, 20);
  const squad = before.rite!.squads[0];
  assert.equal(squad.state.type, 'board');
  if (squad.state.type !== 'board') return;
  const turn = squad.state.turn!;
  const actor = { id: turn.order[0], host: false };
  const command = {
    action: 'ritePass',
    turn: turn.token,
    night: 2,
    epoch: before.rite!.epoch,
  };
  const after = structuredClone(before);
  riteAction(after, actor, command, 30);
  const update = independentCommand(before, after, actor, command)!;
  assert.ok(update);
  assert.equal(update.set[0][0], '$.rite.squads[0]');
  assert.ok(update.guard.some(([path]) => path === '$.rite.epoch'));
  assert.ok(
    !update.guard.some(
      ([path]) => path === '$.rite.squads' || path === '$.rite.squads[1]',
    ),
  );
  after.rite!.squads[1].completeNight = 2;
  assert.equal(independentCommand(before, after, actor, command), null);
});
void test('Storyteller controls survive unrelated actions but cannot cross phases', () => {
  const g = fixture(),
    host = { id: 'host', host: true };
  const control = controls(g, host).find((c) => c.action === 'start')!;
  const command = {
    action: 'start',
    ...Object.fromEntries(control.fields.map((f) => [f.key, f.value])),
    override: true,
  };
  assert.equal(canApplyLatest(host, command), true);
  execute(
    g,
    { id: g.players[0].id, host: false },
    { action: 'chat', text: 'Ready' },
    2,
  );
  execute(g, host, command, 3);
  assert.equal(g.phase, 'night');
  assert.throws(() => execute(g, host, command, 4), /phase changed/);
});
void test('offline puzzle bank preserves certified difficulty and deterministic selection', () => {
  for (const { puzzle: board } of PUZZLE_BANK.board)
    assert.equal(solveBoard(board.blocks)?.length, board.par);
  for (const { puzzle: lab } of PUZZLE_BANK.lab)
    assert.equal(solveLab(lab.vials, 200000)?.length, lab.par);
  for (const kind of ['board', 'lab'] as const) {
    assert.deepEqual(
      preparedPuzzle(kind, 'same'),
      preparedPuzzle(kind, 'same'),
    );
    const puzzle = preparedPuzzle(kind, 'changed');
    assert.ok(puzzle.par >= 28 && puzzle.par <= 32);
    assert.notDeepEqual(puzzle, preparedPuzzle(kind, 'same'));
  }
});
