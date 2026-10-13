import { authenticatedRead, json, errorResponse } from '@/lib/game/store';
import { feedPage, type FeedKind } from '@/lib/game/feed';
import { visibleGame } from '@/lib/game/visible-view';
export async function GET(r: Request) {
  try {
    const { actor, game, version } = await authenticatedRead(r);
    const params = new URL(r.url).searchParams;
    const kind = params.get('kind') as FeedKind;
    if (!['messages', 'log', 'history'].includes(kind))
      throw Error('Choose a feed.');
    const pov =
      actor.host && game.sandbox
        ? game.players.find(
            (p) => p.id === params.get('pov') && p.dummy && !p.departed,
          )
        : null;
    return json({
      ...feedPage(
        await visibleGame(game,actor.id),
        pov ? { id: pov.id, host: false } : actor,
        kind,
        params.get('before') || undefined,
      ),
      version,
      started: game.gameStartedAt,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
