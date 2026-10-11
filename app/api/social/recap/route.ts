import { database } from '@/db';
import { accountAuth } from '@/lib/accounts/service';
import { errorResponse, json, read } from '@/lib/game/store';
import type { SessionRecap } from '@/lib/game/types';
export async function GET(r: Request) {
  try {
    const me = await accountAuth(r);
    if (!me) return json({ error: 'Sign in to view your game recaps.' }, 401);
    const id = new URL(r.url).searchParams.get('id') ?? '';
    const row = await database()
      .prepare(
        'SELECT g.recap,g.code,g.host_account AS host,p.player FROM games g LEFT JOIN game_players p ON p.game=g.id AND p.account=? WHERE g.id=? AND (g.host_account=? OR p.account=?) LIMIT 1',
      )
      .bind(me.id, id, me.id, me.id)
      .first<{
        recap: string | null;
        code: string;
        host: string | null;
        player: string | null;
      }>();
    if (!row)
      return json({ error: 'This recap is not in your game history.' }, 404);
    let raw = row.recap;
    if (!raw) {
      // Older games kept their recap only on the table (now in its stored parts).
      const table = await read(row.code).catch(() => null);
      const old = table?.game.recaps?.find((recap) => recap.id === id);
      raw = old ? JSON.stringify(old) : null;
    }
    if (!raw)
      return json(
        {
          error:
            'Detailed recaps were not saved for this older game. Its statistics are still available.',
        },
        404,
      );
    const {
      progression: _private,
      votes,
      ...recap
    } = JSON.parse(raw) as SessionRecap;
    const mvpCounts: Record<string, number> = {};
    for (const targets of Object.values(votes ?? {}))
      for (const target of targets)
        mvpCounts[target] = (mvpCounts[target] ?? 0) + 1;
    return json({
      me: row.player ?? 'host',
      host: row.host === me.id,
      recaps: [{ ...recap, myReward: null, myVotes: [], mvpCounts }],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
