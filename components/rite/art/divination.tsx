'use client';
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import type { ControlName } from '@/lib/rite/types';
import { controlLabel, OFFERINGS } from '@/lib/rite/ritual';
export function SymbolArt({ symbol }: { symbol: number }) {
  const crescent = symbol === 2 || symbol === 3;
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={
        [
          'Skull',
          'Skull and crossbones',
          'Waning crescent',
          'Waxing crescent',
          'Flying crow',
          'Perched crow',
          'Triangular hourglass',
          'Curvy hourglass',
        ][symbol]
      }
    >
      <circle cx="24" cy="24" r="22" fill="#2c2045" stroke="#756295" />
      {crescent ? (
        <g transform={symbol === 3 ? 'translate(48 0) scale(-1 1)' : undefined}>
          <path d="M28 6A18 18 0 1 0 28 42A19 19 0 0 1 28 6Z" fill="#f0e4b5" />
          <text x="26" y="17" fontSize="12" fill="#f0e4b5">
            ✦
          </text>
        </g>
      ) : symbol <= 1 ? (
        <g fill="#f0e4b5">
          <path d="M13 23C13 7 35 7 35 23L30 29V34H18V29Z" />
          <circle cx="19" cy="22" r="4" fill="#2c2045" />
          <circle cx="29" cy="22" r="4" fill="#2c2045" />
          <path d="M21 29L24 24L27 29Z" fill="#2c2045" />
          {symbol === 1 && (
            <path
              d="M10 38L38 32M10 32L38 38"
              stroke="#f0e4b5"
              strokeWidth="4"
            />
          )}
        </g>
      ) : symbol === 4 ? (
        <path d="M7 30L11 12L24 26L35 11L40 31L25 35Z" fill="#f0e4b5" />
      ) : symbol === 5 ? (
        <g fill="#f0e4b5">
          <ellipse cx="22" cy="25" rx="11" ry="7" />
          <circle cx="30" cy="19" r="6" />
          <path
            d="M33 19H41L35 22M14 28L6 37H20M24 31V38M5 39H40"
            stroke="#f0e4b5"
            strokeWidth="2"
          />
        </g>
      ) : (
        <g fill="none" stroke="#f0e4b5" strokeWidth="3">
          <path
            d={
              symbol === 6
                ? 'M13 8H35L13 40H35Z'
                : 'M13 8H35C35 18 26 20 24 24C26 28 35 30 35 40H13C13 30 22 28 24 24C22 20 13 18 13 8Z'
            }
          />
          <path
            d="M18 11L24 21L30 11M18 37L24 27L30 37"
            fill="#f0e4b5"
            strokeWidth="1"
          />
        </g>
      )}
    </svg>
  );
}
export function AltarArt({
  control,
  value,
}: {
  control: ControlName;
  value: number;
}) {
  return (
    <svg
      viewBox="0 0 180 80"
      role="img"
      aria-label={controlLabel(control, value)}
    >
      {control === 'candles' ? (
        [0, 1, 2].map((i) => (
          <g key={i}>
            <ellipse cx={35 + i * 55} cy="73" rx="15" ry="4" fill="#0c0817" />
            <rect
              x={25 + i * 55}
              y="24"
              width="20"
              height="46"
              rx="2"
              fill={['#c93c45', '#dfdcc6', '#9652d6'][i]}
            />
            <path d={`M${35 + i * 55} 25V18`} stroke="#ede3c2" />
            {!!(value & (1 << i)) && (
              <path
                d={`M${35 + i * 55} 3Q${22 + i * 55} 16 ${35 + i * 55} 21Q${46 + i * 55} 16 ${35 + i * 55} 3Z`}
                fill="#ffd467"
              />
            )}
          </g>
        ))
      ) : control === 'offerings' ? (
        OFFERINGS[value].map((x, i) => (
          <g key={i}>
            <circle
              cx={35 + i * 55}
              cy="40"
              r="24"
              fill="#35284d"
              stroke="#c5a049"
              strokeDasharray="4 3"
            />
            <text x={19 + i * 55} y="49" fontSize="28" fill="#efe3b8">
              {x === 'bone' ? '⚒' : x === 'feather' ? '🪶' : '🌿'}
            </text>
          </g>
        ))
      ) : control === 'chalice' ? (
        <g>
          <path
            d="M62 9H118Q116 53 90 53Q64 53 62 9Z"
            fill="#442640"
            stroke="#c5a049"
            strokeWidth="3"
          />
          <path
            d={`M${64 + value * 1} ${42 - value * 12}H${116 - value * 1}Q110 52 90 52Q70 52 ${64 + value * 1} ${42 - value * 12}Z`}
            fill="#b62951"
          />
          <path d="M90 54V69M74 71H106" stroke="#c5a049" strokeWidth="5" />
        </g>
      ) : control === 'dial' ? (
        <g>
          <circle
            cx="90"
            cy="40"
            r="32"
            fill="#292044"
            stroke="#c5a049"
            strokeWidth="3"
          />
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 45} 90 40)`}>
              <path d="M90 7V14" stroke="#efe3b8" />
            </g>
          ))}
          <path
            d="M90 40V11"
            transform={`rotate(${value * 45} 90 40)`}
            stroke="#e9c963"
            strokeWidth="4"
          />
        </g>
      ) : (
        <g>
          <path d="M70 66H110L105 74H75Z" fill="#756027" stroke="#c5a049" />
          <path d="M90 66V28" stroke="#ac6542" strokeWidth="3" />
          {value > 0 && (
            <path
              d="M90 27Q75 17 90 11Q97 6 90 0"
              fill="none"
              stroke="#b2a7c4"
              strokeWidth="2"
            />
          )}
          {value === 2 && (
            <path d="M90 21Q78 30 90 38Q102 30 90 21Z" fill="#ffd35d" />
          )}
        </g>
      )}
    </svg>
  );
}
