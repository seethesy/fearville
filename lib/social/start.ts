import { database } from '@/db';
import { role, type Game } from '@/lib/game/types';
import { alignmentOf } from './derive';
import { STARTING_ELO, snapshotRatings } from './progression';

// Called only after the engine accepts starting a game, before its CAS save.
export async function prepareProgression(g: Game) {
  if (g.sandbox) {
    if (g.ranked) throw Error('Sandbox games cannot be ranked.');
    delete g.progression;
    return;
  }
  const rows = await database()
    .prepare(
      'SELECT s.player,s.host,s.account,1000+COALESCE((SELECT SUM(p.elo_delta) FROM game_players p WHERE p.account=s.account),0) AS rating,(SELECT COUNT(*) FROM game_players p JOIN games g ON g.id=p.game WHERE p.account=s.account AND g.ranked=1) AS rankedGames,(SELECT code FROM ranked_seats r WHERE r.account=s.account) AS lockedCode FROM account_seats s WHERE s.code=?',
    )
    .bind(g.code)
    .all<{
      player: string;
      host: number;
      account: string;
      rating: number;
      rankedGames: number;
      lockedCode: string | null;
    }>();
  const hostAccount = rows.results.find((r) => r.host)?.account ?? null;
  const seats = g.players.map((p) => {
    const row = rows.results.find((r) => !r.host && r.player === p.id);
    return {
      player: p.id,
      account: row?.account ?? null,
      team: alignmentOf(role(p.role)?.team),
      rating: row?.rating ?? STARTING_ELO,
      rankedGames: row?.rankedGames ?? 0,
    };
  });
  if (g.ranked) {
    if (seats.some((p) => p.team === 'neutral'))
      throw Error('Games with neutral Travelers must be casual.');
    if (
      rows.results.some(
        (r) =>
          !r.host &&
          r.lockedCode &&
          r.lockedCode !== g.code &&
          g.players.some((p) => p.id === r.player),
      )
    )
      throw Error(
        'A participant is already playing another ranked game. Finish that game first.',
      );
    if (!hostAccount || seats.some((p) => !p.account))
      throw Error(
        'Everyone, including the Storyteller, must save their seat to an account before a ranked game.',
      );
    if (
      new Set([hostAccount, ...seats.map((p) => p.account)]).size !==
      seats.length + 1
    )
      throw Error('Each ranked participant must use a different account.');
    if (new Set(seats.map((p) => p.team)).size !== 2)
      throw Error('Ranked games require both good and evil players.');
  }
  g.progression = {
    ranked: !!g.ranked,
    hostAccount,
    seats: snapshotRatings(seats, !!g.ranked),
  };
}
