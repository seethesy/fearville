import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from '../lib/game/types.ts';
import { savedGame } from '../lib/game/saved-state.ts';
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
