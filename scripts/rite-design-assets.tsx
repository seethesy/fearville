// Recreated vector companions to the supplied PNG references, using the same
// scalable art as the implementation. Run through esbuild (see docs/design).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import {
  Wreckage,
  VialArt,
  PlaceArt,
  SymbolArt,
  AltarArt,
} from '../components/rite/art';
import type { Block } from '../lib/rite/types';
function art(
  node: React.ReactNode,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  return renderToStaticMarkup(node).replace(
    '<svg ',
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" `,
  );
}
function page(name: string, title: string, content: string, height = 800) {
  writeFileSync(
    `docs/design/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}"><rect width="720" height="${height}" fill="#0b1718"/><text x="36" y="55" fill="#efe1b4" font-family="Georgia,serif" font-size="28" letter-spacing="2">${title}</text><path d="M36 74H684" stroke="#d4ae4f"/><text x="36" y="100" fill="#91aaa1" font-family="Georgia,serif" font-size="14">Recreated vector companion · implementation art · original PNG is authoritative</text>${content}</svg>`,
  );
}
const blocks: Block[] = [
  { id: 'key', kind: 'carriage', x: 0, y: 2, len: 2, horiz: true, key: true },
  { id: 'a', kind: 'wood', x: 3, y: 0, len: 2, horiz: true },
  { id: 'b', kind: 'crates', x: 4, y: 2, len: 2, horiz: false },
  { id: 'c', kind: 'car', x: 0, y: 0, len: 2, horiz: false },
  { id: 'd', kind: 'tree', x: 2, y: 0, len: 3, horiz: false },
  { id: 'e', kind: 'brick', x: 3, y: 2, len: 3, horiz: false },
  { id: 'f', kind: 'coach', x: 0, y: 5, len: 3, horiz: true },
];
page(
  'escape-fearville',
  'ESCAPE FEARVILLE',
  `<rect x="96" y="150" width="504" height="504" fill="#443f2d" stroke="#926c40" stroke-width="12"/>${Array.from({ length: 7 }, (_, i) => `<path d="M${96 + i * 84} 150V654M96 ${150 + i * 84}H600" stroke="#282a1e" stroke-width="2"/>`).join('')}${blocks.map((b) => art(<Wreckage block={b} />, 98 + b.x * 84, 152 + b.y * 84, (b.horiz ? b.len : 1) * 84 - 4, (b.horiz ? 1 : b.len) * 84 - 4)).join('')}<text x="604" y="368" fill="#d4ae4f" font-size="24">❯❯</text><text x="160" y="716" fill="#efe1b4" font-size="24" font-family="Georgia,serif">Your turn — move one piece</text>`,
);
page(
  'alchemist-laboratory',
  "ALCHEMIST'S LABORATORY",
  `${Array.from({ length: 10 }, (_, i) => art(<VialArt vial={{ id: `v${i}`, shape: i % 7, layers: i < 8 ? [i, (i + 1) % 8, (i + 2) % 8, (i + 3) % 8] : [] }} />, 40 + (i % 5) * 134, 145 + Math.floor(i / 5) * 210, 100, 160)).join('')}<path d="M35 313H680M35 523H680" stroke="#926c40" stroke-width="12"/><text x="36" y="588" fill="#efe1b4" font-size="20" font-family="Georgia,serif">Match liquid color and substance · each vial holds four units</text>${Array.from({ length: 7 }, (_, i) => art(<VialArt vial={{ id: `legend${i}`, shape: i, layers: [i, (i + 1) % 8] }} />, 36 + i * 96, 645, 75, 120)).join('')}`,
);
page(
  'sphinx-riddles',
  "THE SPHINX'S RIDDLES",
  `${['Library', 'Garden', 'House', 'Market', 'Graveyard']
    .map((name, i) => {
      const x = [80, 420, 250, 80, 420][i],
        y = [160, 160, 390, 620, 620][i];
      return (
        art(<PlaceArt place={i} />, x, y, 200, 120) +
        `<text x="${x + 100}" y="${y + 147}" text-anchor="middle" fill="#efe1b4" font-family="Georgia,serif" font-size="22">${name}</text><circle cx="${x + 70}" cy="${y + 189}" r="25" stroke="#aaa" stroke-dasharray="6 4" fill="none"/><circle cx="${x + 98}" cy="${y + 210}" r="16" stroke="#aaa" stroke-dasharray="4 3" fill="none"/>`
      );
    })
    .join(
      '',
    )}<text x="36" y="950" fill="#efe1b4" font-family="Georgia,serif" font-size="20">Your clues · one revealed each night · share with your vigil</text>`,
  1010,
);
page(
  'ritual-divination',
  'RITUAL OF DIVINATION',
  `${(['candles', 'offerings', 'chalice', 'dial', 'incense'] as const).map((control, i) => `<rect x="${30 + (i % 2) * 345}" y="${135 + Math.floor(i / 2) * 200}" width="315" height="185" rx="15" fill="#1b1430" stroke="#685188"/><text x="${50 + (i % 2) * 345}" y="${162 + Math.floor(i / 2) * 200}" fill="#d4ae4f" font-family="Georgia,serif" font-size="18">${control.toUpperCase()}</text>` + art(<AltarArt control={control} value={[5, 3, 1, 2, 1][i]} />, 50 + (i % 2) * 345, 174 + Math.floor(i / 2) * 200, 260, 100)).join('')}${Array.from({ length: 8 }, (_, i) => art(<SymbolArt symbol={i} />, 32 + i * 86, 765, 60, 60)).join('')}<text x="36" y="864" fill="#efe1b4" font-family="Georgia,serif" font-size="18">Eight distinct symbols · three per unlabeled omen set</text>`,
  920,
);
console.log('Recreated four SVG companions from implementation vectors.');
