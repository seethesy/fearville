'use client';
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import type { Block } from '@/lib/rite/types';
export function Wreckage({ block }: { block: Block }) {
  const w = block.horiz ? block.len * 56 : 56,
    h = block.horiz ? 56 : block.len * 56;
  const outlines = {
    carriage: '#f4cb61',
    wood: '#bb925e',
    crates: '#d8b275',
    car: '#95bac7',
    tree: '#72a16f',
    brick: '#bbb9b6',
    coach: '#af754a',
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <rect
        x="3"
        y="3"
        width={w - 6}
        height={h - 6}
        rx={block.kind === 'tree' ? 16 : 7}
        fill={
          block.key
            ? '#992a38'
            : block.kind === 'car'
              ? '#546873'
              : block.kind === 'brick'
                ? '#7b7973'
                : '#705136'
        }
        stroke={outlines[block.kind]}
        strokeWidth="3"
        strokeDasharray={
          block.key
            ? '7 4'
            : block.kind === 'wood'
              ? '2 4'
              : block.kind === 'brick'
                ? '10 3'
                : undefined
        }
      />
      {block.kind === 'crates' ? (
        Array.from({ length: block.len }, (_, i) => (
          <g
            key={i}
            transform={`translate(${block.horiz ? i * 56 : 0},${block.horiz ? 0 : i * 56})`}
          >
            <rect
              x="8"
              y="8"
              width="40"
              height="40"
              fill="#947044"
              stroke="#422c1c"
              strokeWidth="3"
            />
            <path d="M8 8L48 48M48 8L8 48" stroke="#49351e" strokeWidth="3" />
          </g>
        ))
      ) : block.kind === 'tree' ? (
        <path
          d={
            block.horiz
              ? `M12 25H${w - 12}M12 37H${w - 12}`
              : `M25 12V${h - 12}M37 12V${h - 12}`
          }
          stroke="#bd9060"
          strokeWidth="4"
        />
      ) : block.kind === 'carriage' || block.kind === 'coach' ? (
        <g>
          <rect
            x="12"
            y="12"
            width={block.horiz ? w * 0.47 : 32}
            height={block.horiz ? 30 : h * 0.47}
            rx="5"
            fill="#272132"
            stroke={outlines[block.kind]}
            strokeWidth="2"
          />
          <text
            x={block.horiz ? w * 0.57 : 12}
            y={block.horiz ? 39 : h * 0.72}
            fontSize="29"
            fill={block.key ? '#d3ab69' : '#bca282'}
          >
            ♞
          </text>
          <circle cx="9" cy={h - 9} r="5" fill="#201d1a" />
          <circle cx={w - 9} cy={h - 9} r="5" fill="#201d1a" />
        </g>
      ) : block.kind === 'car' ? (
        <g>
          <rect
            x="12"
            y="12"
            width={w - 24}
            height={h - 24}
            rx="10"
            fill="#364951"
          />
          <rect
            x={block.horiz ? w * 0.33 : 14}
            y={block.horiz ? 14 : h * 0.33}
            width={block.horiz ? w * 0.34 : w - 28}
            height={block.horiz ? h - 28 : h * 0.34}
            rx="5"
            fill="#92aeb9"
            stroke="#273c43"
            strokeWidth="3"
          />
          <path
            d={
              block.horiz
                ? `M${w * 0.33} 14V${h - 14}M${w * 0.67} 14V${h - 14}`
                : `M14 ${h * 0.33}H${w - 14}M14 ${h * 0.67}H${w - 14}`
            }
            stroke="#253c42"
            strokeWidth="3"
          />
          {[0.2, 0.8].map((p, i) => (
            <g key={i}>
              <rect
                x={block.horiz ? w * p - 5 : 0}
                y={block.horiz ? 0 : h * p - 5}
                width={block.horiz ? 10 : 7}
                height={block.horiz ? 7 : 10}
                rx="2"
                fill="#151e22"
              />
              <rect
                x={block.horiz ? w * p - 5 : w - 7}
                y={block.horiz ? h - 7 : h * p - 5}
                width={block.horiz ? 10 : 7}
                height={block.horiz ? 7 : 10}
                rx="2"
                fill="#151e22"
              />
            </g>
          ))}
        </g>
      ) : block.kind === 'brick' ? (
        <g>
          {Array.from({ length: block.len * 3 }, (_, i) => (
            <path
              key={i}
              d={
                block.horiz
                  ? `M${8 + i * 17} 6V${h - 6}`
                  : `M6 ${8 + i * 17}H${w - 6}`
              }
              stroke="#4e5151"
              strokeWidth="2"
            />
          ))}
          <path
            d={block.horiz ? `M6 ${h / 2}H${w - 6}` : `M${w / 2} 6V${h - 6}`}
            stroke="#d4d0c7"
            strokeWidth="3"
          />
        </g>
      ) : (
        <g>
          {Array.from({ length: 4 }, (_, i) => (
            <path
              key={i}
              d={
                block.horiz
                  ? `M${12 + i * 15} 10L${22 + i * 15} ${h - 10}`
                  : `M10 ${12 + i * 15}L${w - 10} ${22 + i * 15}`
              }
              stroke={outlines[block.kind]}
              opacity=".6"
              strokeWidth="3"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
