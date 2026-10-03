'use client';
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';

const EffectsContext = createContext(true);
export function useCosmeticMotion() {
  return useContext(EffectsContext);
}

export function TableAtmosphere({
  night,
  children,
}: {
  night: boolean;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(true);
  return (
    <EffectsContext.Provider value={enabled}>
      <div className={`cosmetic-table ${enabled ? '' : 'cosmetic-motion-off'}`}>
        <div
          className={`table-atmosphere ${night ? 'atmosphere-night' : 'atmosphere-day'}`}
          aria-hidden="true"
        >
          <div className="fog-bank fog-bank-one" />
          <div className="fog-bank fog-bank-two" />
          {Array.from({ length: 12 }, (_, i) => (
            <i
              className="ambient-mote"
              key={i}
              style={
                {
                  left: `${(i * 29 + 7) % 100}%`,
                  top: `${(i * 17 + 13) % 100}%`,
                  '--delay': `${-i * 1.7}s`,
                  '--duration': `${14 + (i % 5) * 3}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="atmosphere-control">
          <button
            className="secondary"
            aria-pressed={enabled}
            onClick={() => setEnabled(!enabled)}
          >
            Visual effects: {enabled ? 'on' : 'off'}
          </button>
        </div>
        {children}
      </div>
    </EffectsContext.Provider>
  );
}
