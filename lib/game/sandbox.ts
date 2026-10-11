import { assignAvatars } from './avatars.ts';
import { newGame, newPlayer } from './types.ts';

export function newSandboxGame(code: string, hostName: string) {
  const game = newGame(code, hostName);
  game.sandbox = true;
  game.players = Array.from({ length: 6 }, (_, i) => ({
    ...newPlayer(`Player ${i + 1}`, i + 1),
    dummy: true,
  }));
  assignAvatars(game.players);
  return game;
}
