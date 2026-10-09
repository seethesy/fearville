import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { savedGame } from '../lib/game/saved-state.ts';
import { beginNight, execute, snapshot } from '../lib/game/engine.ts';
void test('new tables default to Horrors and only supported saved scripts load', () => {
  const game = newGame('SAVED', 'Host');
  assert.equal(game.script, 'horrors');
  for (const script of ['horrors', 'holyMoonStars'] as const) {
    game.script = script;
    assert.equal(savedGame(JSON.stringify(game)).script, script);
  }
  assert.throws(
    () => savedGame(JSON.stringify({ ...game, script: 'retired' })),
    /retired script.*Create a new table/,
  );
  delete game.script;
  assert.throws(() => savedGame(JSON.stringify(game)), /retired script/);
});

void test('unsupported saved feature data is discarded and stays discarded after rewind', () => {
  const original = newGame('SAVED', 'Host');
  original.players = [newPlayer('Ada', 1)];
  const fixture = { ...original, obsoleteWidget: { answers: { private: 'secret' } } };
  const game = savedGame(JSON.stringify(fixture));
  assert.deepEqual(game, original);
  snapshot(game, 'A saved decision', 10);
  game.history[0].before = JSON.stringify(fixture);
  beginNight(game, 20);
  execute(game, { id: 'host', host: true }, { action: 'undo' }, 30);
  assert.equal(game.phase, 'lobby');
  assert.equal(game.nightChoiceRound, undefined);
  assert.equal(Object.hasOwn(game, 'obsoleteWidget'), false);
  assert.deepEqual(savedGame(JSON.stringify(game)).players, original.players);
});
