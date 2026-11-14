'use client';
/* Overflow regions need keyboard focus so their contents can be scrolled. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import type { CSSProperties, ReactNode } from 'react';
import type { Vial } from '@/lib/rite/types';
import { RITE_ART } from '@/lib/rite/art-assets';
import { PaintedArt } from './painted';
import { VialArt, SUBSTANCES } from './laboratory';
import { SymbolArt } from './divination';

export function EscapeFrame({ children }: { children: ReactNode }) {
  return (
    <div className="escape-frame">
      <PaintedArt
        art={RITE_ART.surfaces['escape/board-6x6']}
        className="escape-frame-art"
      />
      {children}
    </div>
  );
}

export function LaboratoryShelves({
  vials,
  selected,
  disabled,
  onSelect,
  numbered = false,
}: {
  vials: Vial[];
  selected: string;
  disabled: boolean;
  onSelect: (vial: Vial) => void;
  numbered?: boolean;
}) {
  return (
    <div className="lab-shelf-rooms">
      {Array.from({ length: Math.ceil(vials.length / 12) }, (_, batch) => (
        <section
          className="lab-viewport"
          aria-label="Laboratory shelves"
          tabIndex={0}
          key={batch}
        >
          <div className="lab-shelves lab-scene">
            {vials.slice(batch * 12, batch * 12 + 12).map((vial, index) => {
              const row = Math.floor(index / 6),
                col = index % 6;
              const portrait = RITE_ART.lab.portrait,
                landscape = RITE_ART.lab.landscape;
              return (
                <button
                  className={'vial ' + (selected === vial.id ? 'selected' : '')}
                  key={vial.id}
                  disabled={disabled}
                  aria-pressed={selected === vial.id}
                  aria-label={`Vial ${batch * 12 + index + 1}${selected === vial.id ? ', selected source' : ''}: ${vial.layers.map((c) => `${['green', 'red', 'blue', 'purple', 'yellow', 'teal', 'pink', 'ink', 'orange', 'silver'][c]} ${SUBSTANCES[c]}`).join(', ') || 'empty'}`}
                  style={
                    {
                      '--vial-x': portrait.vialCenters[col] * 100 + '%',
                      '--vial-x-wide': landscape.vialCenters[col] * 100 + '%',
                      '--shelf-y': portrait.shelfBaselines[row] * 100 + '%',
                      '--shelf-y-wide':
                        landscape.shelfBaselines[row] * 100 + '%',
                      '--vial-baseline': RITE_ART.vialBottoms[vial.shape] / 60,
                    } as CSSProperties
                  }
                  onClick={() => onSelect(vial)}
                >
                  <VialArt vial={vial} selected={selected === vial.id} />
                  {numbered && <span>{batch * 12 + index + 1}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function OmensTablet({ omens }: { omens: number[][] }) {
  if (!omens.length) return null;
  return (
    <div className="omens-tablets">
      {Array.from({ length: Math.ceil(omens.length / 3) }, (_, batch) => (
        <div className="omens-tablet" key={batch}>
          <PaintedArt
            art={RITE_ART.surfaces['divination/omens-tablet']}
            className="omens-tablet-art"
          />
          <ol className="omen-bands" aria-label="Omen symbol sets">
            {omens.slice(batch * 3, batch * 3 + 3).map((set, row) => (
              <li
                className="omen-band"
                key={row}
                style={{ top: 23.5 + row * 26.5 + '%' }}
              >
                <span className="sr-only">Set {batch * 3 + row + 1}: </span>
                {set.map((symbol, col) => (
                  <span
                    className="omen-symbol"
                    key={col}
                    style={{ left: 23 + col * 27 + '%' }}
                  >
                    <SymbolArt symbol={symbol} />
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
