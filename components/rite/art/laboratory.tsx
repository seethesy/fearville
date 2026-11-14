'use client';
/* SVG composes the unchanged liquid masks and the painted transparent glass. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { useId } from 'react';
import type { Vial } from '@/lib/rite/types';
import { RITE_ART } from '@/lib/rite/art-assets';
import { spriteSource } from './painted';
export const LIQUIDS = [
  '#50bf43',
  '#d73142',
  '#3164d8',
  '#9250c5',
  '#ffe047',
  '#26b7b5',
  '#df65ad',
  '#302c48',
  '#ee8a2b',
  '#c9cfd8',
];
export const SUBSTANCES = [
  'eyes',
  'bubbles',
  'stars',
  'smoke',
  'lightning',
  'fish',
  'spirals',
  'runes',
  'leaves',
  'crosses',
];
export function LiquidPattern({
  color,
  x,
  y,
}: {
  color: number;
  x: number;
  y: number;
}) {
  return (
    <image
      href={spriteSource(`laboratory/liquid-${color}`)}
      x={x}
      y={y}
      width="50"
      height="17"
    />
  );
}
export function VialArt({
  vial,
  selected = false,
}: {
  vial: Vial;
  selected?: boolean;
}) {
  const id = useId();
  const shape = RITE_ART.vialPaths[vial.shape];
  return (
    <svg
      viewBox="0 0 60 106"
      role="img"
      aria-label={`${vial.id}: ${vial.layers.map((c) => `${['green', 'red', 'blue', 'purple', 'yellow', 'teal', 'pink', 'ink', 'orange', 'silver'][c]} with ${SUBSTANCES[c]}`).join(', ') || 'empty'}`}
    >
      <defs>
        <clipPath id={id}>
          <path d={shape} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {vial.layers.map((color, index) => (
          <g key={index}>
            <rect
              x="5"
              y={90 - (index + 1) * 17}
              width="50"
              height="17"
              fill={LIQUIDS[color]}
            />
            <LiquidPattern color={color} x={5} y={90 - (index + 1) * 17} />
          </g>
        ))}
      </g>
      <image
        href={spriteSource(`laboratory/shell-${vial.shape}`)}
        width="60"
        height="106"
      />
      {selected && (
        <path d={shape} fill="none" stroke="#f5d77b" strokeWidth="2" />
      )}
    </svg>
  );
}
