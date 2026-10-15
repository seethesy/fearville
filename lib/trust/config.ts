// Server-side only. Amounts are integer trust; the daily boundary is UTC.
export const ECONOMY = {
  finish: 20,
  win: 10,
  minNight: 2,
  minPlayers: 5,
  dailyCap: 200,
  gameCap: 45,
  ratingFour: 5,
  ratingFive: 10,
  ratingGameCap: 15,
  minRaters: 3,
} as const;
