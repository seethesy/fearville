import { SCRIPTS, type Game } from './types.ts';

// Old tables without a script identifier also used the retired rules.
// Keep them intact in storage; changing a live table's rules would be unsafe.
export function savedGame(state: string): Game {
  const game = JSON.parse(state) as Game;
  if (!game.script || !Object.hasOwn(SCRIPTS, game.script))
    throw Error(
      'This saved table uses a retired script. Create a new table with Horrors of Fearville or Holy Moon and Stars.',
    );
  return game;
}
