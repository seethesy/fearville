'use client';
import { useState, type CSSProperties } from 'react';
import { Ghost } from 'lucide-react';
import type { DeathEffectId } from '@/lib/game/cosmetics';
import { useCosmeticMotion } from './table-atmosphere';

export function DeathEffect({ effect = 'spirit' }: { effect?: DeathEffectId }) {
  const enabled = useCosmeticMotion();
  const [finished, setFinished] = useState(false);
  if (!enabled || finished || effect === 'none') return null;
  return (
    <span
      className={`death-fx death-fx-${effect}`}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setFinished(true);
      }}
    >
      {effect === 'spirit' && <Ghost className="death-spirit" />}
      {effect === 'mist' ? (
        <>
          <i className="death-mist" />
          <i className="death-mist death-mist-second" />
        </>
      ) : (
        Array.from({ length: effect === 'spirit' ? 6 : 12 }, (_, i) => (
          <i
            key={i}
            className="death-particle"
            style={
              {
                '--dx': `${Math.cos(i * 2.4) * (35 + i * 3)}px`,
                '--dy': `${effect === 'petals' ? 35 + i * 5 : -35 - i * 5}px`,
                '--rotation': `${i * 63}deg`,
                '--delay': `${i * 35}ms`,
              } as CSSProperties
            }
          />
        ))
      )}
    </span>
  );
}
