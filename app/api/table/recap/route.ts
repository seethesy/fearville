import { authenticatedRead, json, errorResponse } from '@/lib/game/store';
import { view } from '@/lib/game/view';
export async function GET(r: Request) {
  try {
    const { game, actor, version } = await authenticatedRead(r);
    const params = new URL(r.url).searchParams;
    const pov =
      actor.host && game.sandbox
        ? game.players.find(
            (p) => p.id === params.get('pov') && p.dummy && !p.departed,
          )
        : null;
    const viewer = pov ? { id: pov.id, host: false } : actor;
    const recap = view(game, viewer, version, Date.now()).recaps.find(
      (entry) => entry.id === params.get('id'),
    );
    if (!recap)
      return json(
        { error: 'This recap is no longer available at your table.' },
        404,
      );
    return json({ recap });
  } catch (e) {
    return errorResponse(e);
  }
}
