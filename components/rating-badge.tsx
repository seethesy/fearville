/* oxlint-disable next/no-img-element -- Small static SVGs, swapped by file (no optimiser). */
// FEAR-133: the rating badge. Sizes: small (lists), medium (profile), large
// (end-screen badge-up; pass `animate`). The season flair variant adds
// "Season N" beneath the badge. Art comes from public/badges/ by band.
import { badgeLabel, badgeSrc, ratingBand } from '@/lib/social/rating-badge';

const SIZES = { small: 24, medium: 64, large: 160 } as const;
export type BadgeSize = keyof typeof SIZES;

export function RatingBadge({
  rating,
  size = 'small',
  animate = false,
  season,
}: {
  rating: number;
  size?: BadgeSize;
  /** Large end-screen badge-up animation. */
  animate?: boolean;
  /** Season flair variant: badge plus "Season N". */
  season?: number;
}) {
  const band = ratingBand(rating);
  const px = SIZES[size];
  const badge = (
    <img
      src={badgeSrc(band)}
      alt={badgeLabel(band)}
      width={px}
      height={px}
      className={`rating-badge rating-badge-${size}${animate ? ' rating-badge-up' : ''}`}
    />
  );
  if (season === undefined) return badge;
  return (
    <span className={`rating-flair rating-flair-${size}`}>
      {badge}
      <span className="rating-flair-season">Season {season}</span>
    </span>
  );
}
