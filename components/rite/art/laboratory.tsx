'use client';
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import type { Vial } from '@/lib/rite/types';
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
  const glyph = ['◉', '○', '✦', '∿', 'ϟ', '⋊', '◎', 'ᛟ', '❦', '✚'][color];
  // Light liquids (yellow, silver) carry dark markings.
  const ink = color === 4 ? '#ac6a0b' : color === 9 ? '#3f4652' : '#f4ecc9';
  return (
    <g fill={ink} fontSize="9" opacity=".9">
      <text x={x + 5} y={y + 10}>
        {glyph}
      </text>
      <text x={x + 18} y={y + 7}>
        {glyph}
      </text>
      <text x={x + 27} y={y + 12}>
        {glyph}
      </text>
    </g>
  );
}
export function VialArt({
  vial,
  selected = false,
}: {
  vial: Vial;
  selected?: boolean;
}) {
  const paths = [
    'M12 12H48V85Q48 91 42 91H18Q12 91 12 85Z',
    'M25 8H35V38L52 88Q52 91 47 91H13Q8 91 8 88L25 38Z',
    'M25 8H35V41C66 51 61 91 30 91S-6 51 25 41Z',
    'M24 8H36V85Q36 95 30 95Q24 95 24 85Z',
    'M17 8H43V88H17Z',
    'M24 23H36V43Q53 46 53 62V88H7V62Q7 46 24 43Z',
    'M8 35H52V73Q52 94 30 94Q8 94 8 73Z',
  ];
  const id = `vial-${vial.id}`;
  return (
    <svg
      viewBox="0 0 60 106"
      role="img"
      aria-label={`${vial.id}: ${vial.layers.map((c) => `${['green', 'red', 'blue', 'purple', 'yellow', 'teal', 'pink', 'ink', 'orange', 'silver'][c]} with ${SUBSTANCES[c]}`).join(', ') || 'empty'}`}
    >
      <defs>
        <clipPath id={id}>
          <path d={paths[vial.shape]} />
        </clipPath>
      </defs>
      <ellipse cx="30" cy="100" rx="26" ry="3" fill="#070e11" />
      <g clipPath={`url(#${id})`}>
        {vial.layers.map((c, i) => (
          <g key={i}>
            <rect
              x="5"
              y={90 - (i + 1) * 17}
              width="50"
              height="17"
              fill={LIQUIDS[c]}
            />
            <LiquidPattern color={c} x={13} y={90 - (i + 1) * 17} />
          </g>
        ))}
        <path d="M19 13V89" stroke="#e6f5ff" opacity=".18" strokeWidth="5" />
      </g>
      <path
        d={paths[vial.shape]}
        fill="none"
        stroke={selected ? '#e5bd54' : '#bdd5dc'}
        strokeWidth={selected ? 3 : 2}
      />
      <path
        d={vial.shape === 5 ? 'M20 23H40V15H20Z' : 'M10 8H50'}
        stroke="#c5dce1"
        fill="#94683b"
        strokeWidth="2"
      />
    </svg>
  );
}
