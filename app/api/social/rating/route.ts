import { accountAuth } from '@/lib/accounts/service';
import { errorResponse, json } from '@/lib/game/store';
import { ratingForGame } from '@/lib/social/ratings';

// Storyteller rating context for one recorded game, shown at the top of every
// recap. Only players and the Storyteller of that game can read it. Ratings
// are written through POST /api/social { action: 'rate' }.
export async function GET(r: Request) {
  try {
    const a = await accountAuth(r);
    if (!a) return json({ account: null, rating: null });
    const id = new URL(r.url).searchParams.get('game') ?? '';
    if (!id || id.length > 100) throw Error('Choose a game.');
    return json({
      account: a.id,
      rating: await ratingForGame(a.id, id, Date.now()),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
