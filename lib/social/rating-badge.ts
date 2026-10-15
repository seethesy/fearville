// FEAR-133: unnamed rating badges, one per 1,000 band (1,000 … 10,000). The
// number is the badge's identity. Art lives in public/badges/ and is swapped
// by replacing files: rating-01000.svg … rating-10000.svg.
export const BADGE_BANDS = [
  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
] as const;
export type BadgeBand = (typeof BADGE_BANDS)[number];

/**
 * The badge for a rating: 1,000–1,999 → 1,000 and so on. Ratings of 10,000
 * and above keep 10,000; ratings below 1,000 (the floor is 500) show 1,000.
 */
export function ratingBand(rating: number): BadgeBand {
  if (!Number.isFinite(rating)) return 1000;
  const band = Math.floor(rating / 1000) * 1000;
  return Math.min(10000, Math.max(1000, band)) as BadgeBand;
}
export function badgeSrc(band: BadgeBand) {
  return `/badges/rating-${String(band).padStart(5, '0')}.svg`;
}
export function badgeLabel(band: BadgeBand) {
  return `Rating badge, ${band.toLocaleString('en-US')}`;
}
