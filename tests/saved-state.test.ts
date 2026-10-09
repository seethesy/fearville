import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, newPlayer } from '../lib/game/types.ts';
import { savedGame } from '../lib/game/saved-state.ts';
import { beginNight, execute, snapshot } from '../lib/game/engine.ts';
import { recapOf } from '../lib/game/lobby.ts';
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

void test('older player and recap decorations are discarded while photos and death effects survive', () => {
  const game = newGame('SAVED', 'Host');
  game.players = [
    {
      ...newPlayer('Ada', 1),
      avatar: 'data:image/jpeg;base64,/9j/AA==',
      deathEffect: 'embers',
    },
  ];
  game.recaps = [recapOf(game, 10)];
  const fixture = structuredClone(game);
  Object.assign(fixture.players[0], { obsoleteDecoration: 'gold' });
  Object.assign(fixture.recaps![0].players[0], { obsoleteDecoration: 'gold' });
  snapshot(fixture, 'Old decision', 10);
  const current = savedGame(JSON.stringify(fixture));
  assert.deepEqual(current.players, game.players);
  assert.deepEqual(current.recaps, JSON.parse(JSON.stringify(game.recaps)));
  assert.equal(
    Object.hasOwn(
      JSON.parse(current.history[0].before).players[0],
      'obsoleteDecoration',
    ),
    false,
  );
  execute(current, { id: 'host', host: true }, { action: 'undo' }, 20);
  assert.deepEqual(current.players, game.players);
  assert.deepEqual(current.recaps, JSON.parse(JSON.stringify(game.recaps)));
});

void test('unsupported saved feature data is discarded and stays discarded after rewind', () => {
  const original = newGame('SAVED', 'Host');
  original.players = [newPlayer('Ada', 1)];
  const fixture = {
    ...original,
    obsoleteWidget: { answers: { private: 'secret' } },
  };
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
