'use client';
/* SVG has no dedicated HTML image tag; role=img gives these vector controls an accessible name. */
/* eslint-disable jsx-a11y/prefer-tag-over-role */
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
