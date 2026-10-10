'use client';
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import type { Block, Vial, ControlName } from '@/lib/rite/types';
import { controlLabel, OFFERINGS } from '@/lib/rite/ritual';
export const LIQUIDS = [
  '#50bf43',
  '#d73142',
  '#3164d8',
  '#9250c5',
  '#ffe047',
  '#26b7b5',
  '#df65ad',
  '#302c48',
];
const SUBSTANCES = [
  'eyes',
  'bubbles',
  'stars',
  'smoke',
  'lightning',
  'fish',
  'spirals',
  'runes',
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
  const glyph = ['◉', '○', '✦', '∿', 'ϟ', '⋊', '◎', 'ᛟ'][color];
  return (
    <g fill={color === 4 ? '#ac6a0b' : '#f4ecc9'} fontSize="9" opacity=".9">
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
      aria-label={`${vial.id}: ${vial.layers.map((c) => `${['green', 'red', 'blue', 'purple', 'yellow', 'teal', 'pink', 'ink'][c]} with ${SUBSTANCES[c]}`).join(', ') || 'empty'}`}
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
export function CharacterArt({ character }: { character: number }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" fill="currentColor">
      {character === 0 ? (
        <>
          <path
            d="M7 32Q32 5 57 32Q32 59 7 32Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          />
          <circle cx="32" cy="32" r="10" />
        </>
      ) : character === 1 ? (
        <path d="M24 9H40V24H55V40H40V55H24V40H9V24H24Z" />
      ) : character === 2 ? (
        <>
          <rect x="9" y="20" width="13" height="34" rx="2" />
          <rect x="25" y="10" width="13" height="44" rx="2" />
          <path d="M43 16L57 19L50 55L36 52Z" />
        </>
      ) : character === 3 ? (
        <>
          <circle
            cx="26"
            cy="26"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
          />
          <path
            d="M38 38L55 55"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <path d="M12 29C12 3 52 3 52 29Q52 41 43 43V55H21V43Q12 41 12 29Z" />
          <circle cx="23" cy="29" r="6" fill="#dce1e2" />
          <circle cx="41" cy="29" r="6" fill="#dce1e2" />
          <path d="M32 35L27 43H37Z" fill="#dce1e2" />
          <path d="M28 46V56M36 46V56" stroke="#dce1e2" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
export function ActivityArt({ activity }: { activity: number }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      {activity === 0 ? (
        <>
          <path
            d="M7 15Q23 11 32 18Q44 11 57 15V52Q44 48 32 54Q20 48 7 52Z"
            fill="#f0e5bf"
            stroke="#92663f"
            strokeWidth="4"
          />
          <path
            d="M32 18V53M13 23H25M13 32H25M39 23H51M39 32H51"
            stroke="#7a6444"
            strokeWidth="2"
          />
        </>
      ) : activity === 1 ? (
        <>
          <path
            d="M32 21C7 9 5 49 22 54Q32 59 42 54C61 49 55 9 32 21Z"
            fill="#ce3037"
            stroke="#7f2529"
            strokeWidth="3"
          />
          <path
            d="M32 20Q31 6 44 5"
            stroke="#6d492c"
            strokeWidth="4"
            fill="none"
          />
          <path d="M35 12Q45 0 56 8Q45 21 35 12Z" fill="#4e9b43" />
        </>
      ) : activity === 2 ? (
        <>
          <circle
            cx="15"
            cy="43"
            r="12"
            fill="none"
            stroke="#46728d"
            strokeWidth="3"
          />
          <circle
            cx="49"
            cy="43"
            r="12"
            fill="none"
            stroke="#46728d"
            strokeWidth="3"
          />
          <path
            d="M15 43L27 20L39 43H15L35 14H44L49 43M22 20H33"
            stroke="#2983b4"
            strokeWidth="4"
            fill="none"
          />
        </>
      ) : activity === 3 ? (
        <>
          <path
            d="M9 27L15 55H49L55 27Z"
            fill="#a88b4e"
            stroke="#594726"
            strokeWidth="4"
          />
          <path
            d="M19 29Q20 7 32 8Q45 9 46 29"
            stroke="#b4a57a"
            strokeWidth="5"
            fill="none"
          />
          <circle cx="22" cy="24" r="8" fill="#d8553d" />
          <circle cx="38" cy="22" r="9" fill="#7ca948" />
          <path
            d="M7 30H57M19 35V52M31 35V52M43 35V52M14 41H51"
            stroke="#5e4d2d"
            strokeWidth="3"
          />
        </>
      ) : (
        <>
          <path
            d="M6 14Q31 20 58 14L55 50Q31 44 9 50Z"
            fill="#e4daef"
            stroke="#987fb2"
            strokeWidth="4"
          />
          <path
            d="M14 22Q30 27 51 22"
            stroke="#b9a6cb"
            fill="none"
            strokeWidth="3"
          />
        </>
      )}
    </svg>
  );
}
export function PlaceArt({ place }: { place: number }) {
  return (
    <svg viewBox="0 0 160 105" aria-hidden="true">
      <ellipse cx="80" cy="96" rx="68" ry="8" fill="#504934" />
      {place === 0 ? (
        <g>
          <path
            d="M12 38L80 8L148 38Z"
            fill="#808077"
            stroke="#373b34"
            strokeWidth="4"
          />
          <rect x="24" y="39" width="112" height="51" fill="#776e53" />
          {[35, 61, 87, 113].map((x) => (
            <g key={x}>
              <rect x={x} y="40" width="10" height="48" fill="#c2b999" />
              <rect
                x={x + 12}
                y="53"
                width="7"
                height="20"
                rx="4"
                fill="#f8d580"
              />
            </g>
          ))}
          <circle cx="80" cy="27" r="8" fill="#eccb75" />
        </g>
      ) : place === 1 ? (
        <g>
          {[20, 40, 62, 103, 125, 141].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={62 + (i % 2) * 12}
              r="17"
              fill="#2b6e39"
            />
          ))}
          <path
            d="M55 58Q55 5 104 58"
            fill="none"
            stroke="#49934d"
            strokeWidth="12"
          />
          <path
            d="M55 58Q55 5 104 58"
            fill="none"
            stroke="#d66c9e"
            strokeWidth="5"
            strokeDasharray="5 5"
          />
          <ellipse
            cx="80"
            cy="81"
            rx="31"
            ry="8"
            fill="#426a81"
            stroke="#99c4d7"
            strokeWidth="3"
          />
          <path
            d="M80 77V50M67 50Q80 59 93 50"
            stroke="#b4d4de"
            strokeWidth="6"
          />
        </g>
      ) : place === 2 ? (
        <g>
          <rect x="34" y="45" width="93" height="46" fill="#b3915f" />
          <path
            d="M19 47L79 9L140 47Z"
            fill="#8b3930"
            stroke="#49251c"
            strokeWidth="3"
          />
          <rect x="49" y="59" width="15" height="17" fill="#f5d175" />
          <rect x="101" y="59" width="15" height="17" fill="#f5d175" />
          <path
            d="M72 91V69Q82 54 93 69V91"
            fill="#775023"
            stroke="#382c1c"
            strokeWidth="3"
          />
          <path d="M123 25V3" stroke="#8e9183" strokeWidth="8" />
        </g>
      ) : place === 3 ? (
        <g>
          <rect x="25" y="49" width="111" height="41" fill="#8b623b" />
          <path d="M16 49L28 18H130L145 49Z" fill="#ece0c4" />
          {[25, 55, 85, 115].map((x) => (
            <path
              key={x}
              d={`M${x} 18L${x - 6} 49H${x + 9}L${x + 15} 18Z`}
              fill="#b83c40"
            />
          ))}
          {[38, 53, 68, 85, 104, 119].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy="64"
              r="6"
              fill={['#dc7040', '#eabd48', '#90b866'][i % 3]}
            />
          ))}
          <path d="M28 74H133" stroke="#493526" strokeWidth="4" />
        </g>
      ) : (
        <g>
          <path d="M60 45H111V88H60Z" fill="#5b7274" />
          <path d="M47 47L85 19L122 47Z" fill="#67787b" />
          <path d="M81 91V66Q87 53 96 66V91" fill="#21373d" />
          <path d="M83 22V9M76 15H91" stroke="#adb9b2" strokeWidth="3" />
          {[27, 45, 121, 137].map((x, i) => (
            <path
              key={x}
              d={`M${x} 91V${67 + (i % 2) * 8}Q${x + 6} ${55 + (i % 2) * 8} ${x + 12} ${67 + (i % 2) * 8}V91`}
              fill="#8c9c94"
              stroke="#303c3b"
              strokeWidth="2"
            />
          ))}
          <path d="M18 90H144M18 81H144" stroke="#273a32" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}
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
