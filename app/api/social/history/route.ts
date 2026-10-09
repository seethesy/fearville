import { json, errorResponse } from '@/lib/game/store';
import { accountAuth } from '@/lib/accounts/service';
import { recentGames } from '@/lib/social/stats';
import {
  accountByHandle,
  relations,
  relationStatus,
} from '@/lib/social/friends';
import { normalizeHandle } from '@/lib/social/derive';
import { canView, privacyFor } from '@/lib/social/privacy';

export async function GET(r: Request) {
  try {
    const me = await accountAuth(r);
    if (!me) return json({ error: 'Sign in to view match history.' }, 401);
    const query = new URL(r.url).searchParams;
    const handle = query.get('handle');
    let account = me.id;
    if (handle) {
      const target = await accountByHandle(normalizeHandle(handle));
      if (!target) return json({ error: 'Player not found.' }, 404);
      const relation =
        target.id === me.id
          ? 'self'
          : relationStatus(me.id, await relations(me.id, target.id));
      if (!canView((await privacyFor(target.id)).history, relation))
        return json({ error: 'This match history is private.' }, 403);
      account = target.id;
    }
    const offset = Number(query.get('offset') ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
      throw Error('Choose a valid history page.');
    const rows = await recentGames(account, 21, offset);
    return json({
      games: rows.slice(0, 20),
      nextOffset: rows.length > 20 ? offset + 20 : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
