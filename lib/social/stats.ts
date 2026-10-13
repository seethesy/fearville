import { database } from '@/db';
import { role, SCRIPTS } from '@/lib/game/types';
import { levelProgress, STARTING_ELO } from './progression';

export type Record = { wins: number; losses: number };
export type Breakdown = Record & {
  played: number;
  winRate: number | null;
  averageOpponentElo: number | null;
  averageTeamElo: number | null;
};
export type RoleStat = Breakdown & {
  role: string;
  name: string;
  team: string;
  roleType: string;
};
export type TypeStat = Breakdown & { type: string; roles: RoleStat[] };
export type ScriptStat = Breakdown & {
  script: string;
  name: string;
  roleTypes: TypeStat[];
  roles: RoleStat[];
};
export type Stats = Breakdown & {
  games: number;
  town: Record;
  evil: Record;
  roles: RoleStat[];
  roleTypes: TypeStat[];
  scripts: ScriptStat[];
  progression: ReturnType<typeof levelProgress>;
  elo: number;
  ranked: Breakdown;
  peakElo: number;
  mvpVotes: number;
  mvpXp: number;
  currentWinStreak: number;
  bestWinStreak: number;
  averageDurationMinutes: number | null;
  survivalRate: number | null;
  storyteller: { games: number; rating: number | null; ratings: number };
};
export type RecentGame = {
  id: string;
  code: string;
  hostName: string;
  ended: number;
  started: number;
  players: number;
  winner: string;
  reason: string;
  script: string;
  ranked: number;
  role: string | null;
  roleName: string | null;
  team: string | null;
  won: number | null;
  storyteller: boolean;
  xp: number;
  mvpVotes: number;
  eloDelta: number;
  ratingBefore: number | null;
  averageOpponentElo: number | null;
  averageTeamElo: number | null;
};
type Aggregate = {
  script: string;
  role: string;
  role_type: string;
  team: string;
  ranked: number;
  played: number;
  wins: number;
  alive: number;
  duration: number;
  opponentSum: number;
  opponentSamples: number;
  teamSum: number;
  teamSamples: number;
  xp: number;
  mvpXp: number;
  votes: number;
  delta: number;
};
const sum = (rows: Aggregate[], key: keyof Aggregate) =>
  rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);
const ratio = (n: number, total: number) =>
  total ? Math.round((n / total) * 1000) / 10 : null;
function breakdown(rows: Aggregate[]): Breakdown {
  const played = sum(rows, 'played'),
    wins = sum(rows, 'wins');
  const opponents = sum(rows, 'opponentSamples'),
    teammates = sum(rows, 'teamSamples');
  return {
    played,
    wins,
    losses: played - wins,
    winRate: ratio(wins, played),
    averageOpponentElo: opponents
      ? Math.round(sum(rows, 'opponentSum') / opponents)
      : null,
    averageTeamElo: teammates
      ? Math.round(sum(rows, 'teamSum') / teammates)
      : null,
  };
}
function groups(rows: Aggregate[], key: keyof Aggregate) {
  const result = new Map<string, Aggregate[]>();
  for (const r of rows) {
    const id = String(r[key]);
    result.set(id, [...(result.get(id) ?? []), r]);
  }
  return [...result];
}
function rolesFor(rows: Aggregate[]): RoleStat[] {
  return groups(rows, 'role')
    .map(([id, entries]) => ({
      ...breakdown(entries),
      role: id,
      name: role(id)?.name ?? id,
      team: entries[0].team,
      roleType: role(id)?.team ?? entries[0].role_type,
    }))
    .sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
}
function typesFor(rows: Aggregate[]): TypeStat[] {
  return groups(rows, 'role_type').map(([type, entries]) => ({
    ...breakdown(entries),
    type,
    roles: rolesFor(entries),
  }));
}

// Statistics and balances come from the same durable per-game ledger. A
// withdrawn result removes XP, Elo and all breakdowns without counter drift.
export async function statsFor(account: string): Promise<Stats> {
  const db = database();
  const [aggregates, hosted, feedback, streaks, peak] = await Promise.all([
    db
      .prepare(
        `SELECT g.script,p.role,CASE WHEN p.role_type='unknown' THEN p.team ELSE p.role_type END AS role_type,p.team,g.ranked,COUNT(*) AS played,SUM(p.won) AS wins,SUM(p.alive) AS alive,SUM(MAX(0,g.ended-g.started)) AS duration,SUM(p.opponent_rating) AS opponentSum,COUNT(p.opponent_rating) AS opponentSamples,SUM(p.team_rating) AS teamSum,COUNT(p.team_rating) AS teamSamples,SUM(p.base_xp+p.mvp_xp) AS xp,SUM(p.mvp_xp) AS mvpXp,SUM(p.mvp_votes) AS votes,SUM(p.elo_delta) AS delta FROM game_players p JOIN games g ON g.id=p.game WHERE p.account=? GROUP BY g.script,p.role,p.role_type,p.team,g.ranked`,
      )
      .bind(account)
      .all<Aggregate>(),
    db
      .prepare(
        'SELECT COUNT(*) AS n,COALESCE(SUM(host_xp),0) AS xp FROM games WHERE host_account=?',
      )
      .bind(account)
      .first<{ n: number; xp: number }>(),
    db
      .prepare(
        'SELECT AVG(stars) AS average,COUNT(*) AS n FROM storyteller_ratings WHERE storyteller=?',
      )
      .bind(account)
      .first<{ average: number | null; n: number }>(),
    db
      .prepare(
        `WITH sequence AS (SELECT p.won,g.ended,ROW_NUMBER() OVER (ORDER BY g.ended,g.id)-ROW_NUMBER() OVER (PARTITION BY p.won ORDER BY g.ended,g.id) AS run FROM game_players p JOIN games g ON g.id=p.game WHERE p.account=?) SELECT won,COUNT(*) AS n,MAX(ended) AS last FROM sequence GROUP BY won,run ORDER BY last DESC`,
      )
      .bind(account)
      .all<{ won: number; n: number; last: number }>(),
    db
      .prepare(
        `SELECT MAX(total) AS peak FROM (SELECT 1000+SUM(p.elo_delta) OVER (ORDER BY g.ended,g.id) AS total FROM game_players p JOIN games g ON g.id=p.game WHERE p.account=?)`,
      )
      .bind(account)
      .first<{ peak: number | null }>(),
  ]);
  const rows = aggregates.results;
  // Legacy records did not store type; recover it from the character registry.
  for (const row of rows) row.role_type = role(row.role)?.team ?? row.role_type;
  const total = breakdown(rows);
  const town = breakdown(rows.filter((r) => r.team === 'good')),
    evil = breakdown(rows.filter((r) => r.team === 'evil'));
  return {
    ...total,
    games: total.played,
    town: { wins: town.wins, losses: town.losses },
    evil: { wins: evil.wins, losses: evil.losses },
    roles: rolesFor(rows),
    roleTypes: typesFor(rows),
    scripts: groups(rows, 'script').map(([script, entries]) => ({
      ...breakdown(entries),
      script,
      name:
        SCRIPTS[script as keyof typeof SCRIPTS] ??
        'Legacy · script unavailable',
      roleTypes: typesFor(entries),
      roles: rolesFor(entries),
    })),
    progression: levelProgress(sum(rows, 'xp') + (hosted?.xp ?? 0) + ((await db.prepare('SELECT xp_offset FROM admin_progression WHERE account=?').bind(account).first<{xp_offset:number}>())?.xp_offset ?? 0)),
    elo: STARTING_ELO + sum(rows, 'delta'),
    ranked: breakdown(rows.filter((r) => r.ranked)),
    peakElo: Math.max(STARTING_ELO, peak?.peak ?? STARTING_ELO),
    mvpVotes: sum(rows, 'votes'),
    mvpXp: sum(rows, 'mvpXp'),
    currentWinStreak: streaks.results[0]?.won ? streaks.results[0].n : 0,
    bestWinStreak: Math.max(
      0,
      ...streaks.results.filter((s) => s.won).map((s) => s.n),
    ),
    averageDurationMinutes: total.played
      ? Math.round(sum(rows, 'duration') / total.played / 6000) / 10
      : null,
    survivalRate: ratio(sum(rows, 'alive'), total.played),
    storyteller: {
      games: hosted?.n ?? 0,
      rating:
        feedback?.average == null
          ? null
          : Math.round(feedback.average * 100) / 100,
      ratings: feedback?.n ?? 0,
    },
  };
}

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
export async function recentGames(account: string, limit = 20, offset = 0) {
  const rows = await database()
    .prepare(
      `SELECT g.id,g.code,g.host_name AS hostName,g.ended,g.started,g.players,g.winner,g.reason,g.script,g.ranked,p.role,p.team,p.won,CASE WHEN g.host_account=? THEN 1 ELSE 0 END AS storyteller,CASE WHEN g.host_account=? THEN g.host_xp ELSE p.base_xp+p.mvp_xp END AS xp,COALESCE(p.mvp_votes,0) AS mvpVotes,COALESCE(p.elo_delta,0) AS eloDelta,p.rating_before AS ratingBefore,p.opponent_rating AS averageOpponentElo,p.team_rating AS averageTeamElo FROM games g LEFT JOIN game_players p ON p.game=g.id AND p.account=? WHERE p.account=? OR g.host_account=? ORDER BY g.ended DESC,g.id DESC LIMIT ? OFFSET ?`,
    )
    .bind(
      account,
      account,
      account,
      account,
      account,
      Math.min(100, Math.max(1, Math.floor(limit))),
      Math.max(0, Math.floor(offset)),
    )
    .all<
      Omit<RecentGame, 'roleName' | 'storyteller'> & { storyteller: number }
    >();
  return rows.results.map<RecentGame>((g) => ({
    ...g,
    roleName: g.role ? (role(g.role)?.name ?? g.role) : null,
    storyteller: !!g.storyteller,
  }));
}
