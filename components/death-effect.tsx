'use client';
import { useState, type CSSProperties } from 'react';
import { Ghost, Flame, Flower2, Eclipse } from 'lucide-react';
import type { DeathEffectId } from '@/lib/game/cosmetics';
import { useCosmeticMotion } from './table-atmosphere';

const sigils = { spirit: Ghost, embers: Flame, petals: Flower2, mist: Eclipse };

export function DeathEffect({ effect = 'spirit' }: { effect?: DeathEffectId }) {
  const enabled = useCosmeticMotion();
  const [finished, setFinished] = useState(false);
  if (!enabled || finished || effect === 'none') return null;
  const Sigil = sigils[effect];
  return (
    <span
      className={`death-fx death-fx-${effect}`}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setFinished(true);
      }}
    >
      <span className="death-scene">
        <i className="fx-aura" />
        <i className="fx-charge" />
        <i className="fx-rune" />
        <i className="fx-impact" />
        <i className="fx-ring" />
        <i className="fx-ring fx-ring-echo" />
        <i className="fx-beam" />
        <Sigil className="fx-sigil" strokeWidth={1.2} />
        {Array.from({ length: 28 }, (_, i) => {
          const angle = i * 2.39996;
          const radius = 65 + (i % 7) * 17;
          return (
            <i
              key={i}
              className={`fx-spark ${i % 4 === 0 ? 'fx-shard' : ''}`}
              style={
                {
                  '--dx': `${Math.cos(angle) * radius}px`,
                  '--dy': `${Math.sin(angle) * radius}px`,
                  '--fall': `${50 + (i % 5) * 18}px`,
                  '--angle': `${i * 47}deg`,
                  '--delay': `${600 + (i % 6) * 45}ms`,
                  '--duration': `${1.3 + (i % 5) * 0.23}s`,
                } as CSSProperties
              }
            />
          );
        })}
        {Array.from({ length: 5 }, (_, i) => (
          <i
            key={i}
            className="fx-smoke"
            style={
              {
                '--angle': `${i * 72}deg`,
                '--delay': `${700 + i * 90}ms`,
              } as CSSProperties
            }
          />
        ))}
      </span>
    </span>
  );
}
