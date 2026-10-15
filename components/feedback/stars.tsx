'use client';
import { useId } from 'react';
import { Star } from 'lucide-react';

// FEAR-174: 1–5 star tap rating. One tap sets the score. Native radio inputs
// give keyboard support (arrow keys) and screen reader announcements.
export function StarRating({
  value,
  onChange,
  label,
  disabled,
  size = 30,
}: {
  value: number;
  onChange: (stars: number) => void;
  label: string;
  disabled?: boolean;
  size?: number;
}) {
  const name = useId();
  return (
    <fieldset className="star-rating" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= value ? 'on' : ''}>
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            aria-label={`${n} of 5 stars`}
          />
          <Star
            aria-hidden="true"
            size={size}
            fill={n <= value ? 'currentColor' : 'none'}
          />
        </label>
      ))}
    </fieldset>
  );
}
