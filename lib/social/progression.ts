// Pure, server-authoritative progression rules. Keep calibration out of views.
export const BASE_XP = 100;
export const STARTING_ELO = 1000;
export type RatingSeat = {
  player: string;
  account: string | null;
  team: 'good' | 'evil' | 'neutral';
  rating: number;
  rankedGames: number;
};
export type RatingSnapshot = RatingSeat & {
  opponentRating: number | null;
  teamRating: number | null;
  win: number;
  loss: number;
};
export type ProgressionSnapshot = {
  ranked: boolean;
  hostAccount: string | null;
  seats: RatingSnapshot[];
};

export function volatility(rating: number) {
  return Math.max(350, 750 - Math.floor(Math.max(0, rating) / 2000) * 100);
}
export function calibration(completedGames: number) {
  return completedGames < 10 ? 1.7 : completedGames < 25 ? 1.3 : 1;
}
export function expectedWin(rating: number, opponent: number) {
  return 1 / (1 + 10 ** ((opponent - rating) / 2500));
}
export function ratingChanges(rating: number, opponent: number, games: number) {
  const expected = expectedWin(rating, opponent);
  const k = volatility(rating) * calibration(games);
  return {
    win: Math.round(k * (1 - expected)),
    loss: Math.round(-k * expected) || 0,
  };
}
export function snapshotRatings(
  seats: RatingSeat[],
  ranked: boolean,
): RatingSnapshot[] {
  const average = (rows: RatingSeat[]) =>
    rows.length
      ? rows.reduce((sum, p) => sum + p.rating, 0) / rows.length
      : null;
  return seats.map((p) => {
    const opponentRating = p.team === 'neutral' ? null : average(seats.filter((q) => q.team !== 'neutral' && q.team !== p.team));
    // Teammates excludes the player themselves.
    const teamRating = p.team === 'neutral' ? null : average(
      seats.filter((q) => q.team === p.team && q.player !== p.player),
    );
    return {
      ...p,
      opponentRating,
      teamRating,
      ...(ranked && opponentRating !== null
        ? ratingChanges(p.rating, opponentRating, p.rankedGames)
        : { win: 0, loss: 0 }),
    };
  });
}

export function mvpShares(
  players: string[],
  votes: Record<string, string[]> = {},
) {
  const counts: Record<string, number> = Object.fromEntries(
    players.map((id) => [id, 0]),
  );
  const allowed = new Set(players);
  let total = 0;
  for (const [voter, picks] of Object.entries(votes)) {
    if (voter !== 'host' && !allowed.has(voter)) continue;
    if (!Array.isArray(picks)) continue;
    // Validate again at the reward boundary, including legacy game state.
    for (const target of [...new Set(picks)].slice(
      0,
      voter === 'host' ? 3 : 1,
    )) {
      if (!allowed.has(target) || target === voter) continue;
      counts[target]++;
      total++;
    }
  }
  return Object.fromEntries(
    players.map((id) => [
      id,
      {
        votes: counts[id],
        xp: total ? (BASE_XP * counts[id]) / total : 0,
      },
    ]),
  );
}

// Exponential cumulative thresholds, with no configured maximum level.
export function levelProgress(experience: number) {
  const xp = Math.max(0, Number.isFinite(experience) ? experience : 0);
  const threshold = (level: number) =>
    Math.ceil((500 * Math.expm1((level - 1) * Math.log(1.15))) / 0.15 - 1e-8);
  let level = Math.max(
    1,
    Math.floor(Math.log1p((xp * 0.15) / 500) / Math.log(1.15)) + 1,
  );
  while (level > 1 && threshold(level) > xp) level--;
  while (threshold(level + 1) <= xp) level++;
  const start = threshold(level),
    next = threshold(level + 1);
  return {
    xp,
    level,
    earned: xp - start,
    required: next - start,
    remaining: next - xp,
  };
}
