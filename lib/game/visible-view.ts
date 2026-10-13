import { hiddenChatSenders } from '../social/reports';
import { view } from './view';
import type { Actor, Game } from './types';
// Block filtering precedes paging and hashing, for HTTP and socket views alike.
export async function visibleGame(game: Game, viewer: string) {
  const hidden = await hiddenChatSenders(game.code, viewer);
  if (!hidden.length) return game;
  return {
    ...game,
    messages: game.messages.filter(
      (m) => !(m.kind === 'chat' && hidden.includes(m.from)),
    ),
  };
}
export async function tableView(
  game: Game,
  actor: Actor,
  version: number,
  now: number,
  sandboxHost = false,
  credentialViewer = actor.id,
) {
  const hidden = await hiddenChatSenders(game.code, credentialViewer);
  return {
    ...view(
      {
        ...game,
        messages: game.messages.filter(
          (m) => !(m.kind === 'chat' && hidden.includes(m.from)),
        ),
      },
      actor,
      version,
      now,
      sandboxHost,
    ),
    blockedChatSenders: hidden,
  };
}
