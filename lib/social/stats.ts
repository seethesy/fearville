import { database } from '@/db';
import { role } from '@/lib/game/types';

export type Record = { wins: number; losses: number };
export type RoleStat = {
  role: string;
  name: string;
  team: string;
  played: number;
  wins: number;
  losses: number;
};
export type Stats = {
  games: number;
  town: Record;
  evil: Record;
  roles: RoleStat[];
  storyteller: { games: number; rating: number | null; ratings: number };
};
export type RecentGame = {
  id: string;
  code: string;
  hostName: string;
  ended: number;
  players: number;
  winner: string;
  reason: string;
  role: string | null;
  roleName: string | null;
  team: string | null;
  won: number | null;
  storyteller: boolean;
};

// All figures are aggregated from game records on demand. Nothing is
// incremented, so a withdrawn (rewound) game simply disappears from the totals.
export async function statsFor(account: string): Promise<Stats> {
  const db = database();
  const teams = await db
    .prepare(
      'SELECT team,won,COUNT(*) AS n FROM game_players WHERE account=? GROUP BY team,won',
    )
    .bind(account)
    .all<{ team: string; won: number; n: number }>();
  const town = { wins: 0, losses: 0 },
    evil = { wins: 0, losses: 0 };
  for (const t of teams.results) {
    const bucket = t.team === 'evil' ? evil : town;
    if (t.won) bucket.wins += t.n;
    else bucket.losses += t.n;
  }
  const roles = await db
    .prepare(
      'SELECT role,team,COUNT(*) AS played,SUM(won) AS wins FROM game_players WHERE account=? GROUP BY role,team ORDER BY played DESC,role',
    )
    .bind(account)
    .all<{ role: string; team: string; played: number; wins: number }>();
  const hosted = await db
    .prepare('SELECT COUNT(*) AS n FROM games WHERE host_account=?')
    .bind(account)
    .first<{ n: number }>();
  const rating = await db
    .prepare(
      'SELECT AVG(stars) AS average,COUNT(*) AS n FROM storyteller_ratings WHERE storyteller=?',
    )
    .bind(account)
    .first<{ average: number | null; n: number }>();
  return {
    games: town.wins + town.losses + evil.wins + evil.losses,
    town,
    evil,
    roles: roles.results.map((r) => ({
      role: r.role,
      name: role(r.role)?.name || r.role,
      team: r.team,
      played: r.played,
      wins: r.wins,
      losses: r.played - r.wins,
    })),
    storyteller: {
      games: hosted?.n || 0,
      rating:
        rating?.average == null ? null : Math.round(rating.average * 100) / 100,
      ratings: rating?.n || 0,
    },
  };
}

// Games shared with each other account: seated together, or one of them
// storytelling for the other. Keyed by the other account's id.
export async function gamesTogether(account: string) {
  const rows = await database()
    .prepare(
      'WITH mine AS (SELECT game FROM game_players WHERE account=? UNION SELECT id FROM games WHERE host_account=?), everyone AS (SELECT game,account FROM game_players WHERE account IS NOT NULL UNION SELECT id,host_account FROM games WHERE host_account IS NOT NULL) SELECT e.account,COUNT(*) AS n,MAX(g.ended) AS last FROM mine m JOIN everyone e ON e.game=m.game JOIN games g ON g.id=m.game WHERE e.account<>? GROUP BY e.account',
    )
    .bind(account, account, account)
    .all<{ account: string; n: number; last: number }>();
  return new Map(
    rows.results.map((r) => [r.account, { games: r.n, last: r.last }]),
  );
}

export async function recentGames(account: string, limit = 20) {
  const rows = await database()
    .prepare(
      'SELECT g.id,g.code,g.host_name AS hostName,g.ended,g.players,g.winner,g.reason,p.role,p.team,p.won,CASE WHEN g.host_account=? THEN 1 ELSE 0 END AS storyteller FROM games g LEFT JOIN game_players p ON p.game=g.id AND p.account=? WHERE p.account=? OR g.host_account=? ORDER BY g.ended DESC LIMIT ?',
    )
    .bind(account, account, account, account, limit)
    .all<
      Omit<RecentGame, 'roleName' | 'storyteller'> & { storyteller: number }
    >();
  return rows.results.map<RecentGame>((g) => ({
    ...g,
    roleName: g.role ? role(g.role)?.name || g.role : null,
    storyteller: !!g.storyteller,
  }));
}
