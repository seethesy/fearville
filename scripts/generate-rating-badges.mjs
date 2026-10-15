// FEAR-133: placeholder rating badge art, written to public/badges/. Each band
// escalates in ways readable without colour: more polygon sides, more pips,
// extra rings every few bands, and the band's numeral. Final art (a separate
// ticket for Sean) replaces these files one for one; no code change needed.
//   node scripts/generate-rating-badges.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const fills = [
  '#7a5230',
  '#8c5f36',
  '#9b6b3c',
  '#8f979e',
  '#a7b0b8',
  '#c0c8cf',
  '#c9a227',
  '#ddb63a',
  '#8a5cc7',
  '#b04ad6',
];
const point = (r, a) =>
  `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
mkdirSync('public/badges', { recursive: true });
for (let n = 1; n <= 10; n++) {
  const sides = n + 2;
  const polygon = Array.from({ length: sides }, (_, i) =>
    point(44, -Math.PI / 2 + (i * 2 * Math.PI) / sides),
  ).join(' ');
  const pips = Array.from({ length: n }, (_, i) => {
    const [x, y] = point(33, -Math.PI / 2 + (i * 2 * Math.PI) / n).split(',');
    return `<circle cx="${x}" cy="${y}" r="3" fill="#f5efe2"/>`;
  }).join('');
  const rings = Array.from(
    { length: Math.floor((n - 1) / 3) + 1 },
    (_, i) =>
      `<circle cx="50" cy="50" r="${24 - i * 4}" fill="none" stroke="#f5efe2" stroke-width="1.5" opacity="0.8"/>`,
  ).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Placeholder rating badge ${n * 1000} (FEAR-133), from scripts/generate-rating-badges.mjs. Replace this file with the final art; keep the name and the 100x100 viewBox. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<polygon points="${polygon}" fill="${fills[n - 1]}" stroke="#1a1416" stroke-width="3" stroke-linejoin="round"/>
${rings}${pips}
<text x="50" y="58" text-anchor="middle" font-family="Georgia, serif" font-size="${n === 10 ? 20 : 24}" font-weight="700" fill="#f5efe2" stroke="#1a1416" stroke-width="0.8">${n}K</text>
</svg>
`;
  writeFileSync(
    `public/badges/rating-${String(n * 1000).padStart(5, '0')}.svg`,
    svg,
  );
}
console.log('Wrote 10 placeholder badges to public/badges/.');
