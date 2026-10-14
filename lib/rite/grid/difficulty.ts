import { worlds, WORDS } from './solver.ts';
// ---------------------------------------------------------------------------
// Difficulty: how a solver that reasons one clue at a time on the grid fares
// ---------------------------------------------------------------------------
// The knowledge state is the three cross-off grids (character-location,
// character-activity, location-activity). Each round, every clue is combined
// with the current grids alone, and any pairing impossible under that clue is
// crossed off. Easy puzzles fall to a few rounds of this; hard ones need many
// rounds, or stall entirely and demand combining several clues at once.
export let cellCache: Uint8Array | undefined;
// For each world, the 15 grid cells it uses (5 people x 3 pairings).
export function cells() {
  if (cellCache) return cellCache;
  const ws = worlds(),
    out = new Uint8Array(ws.length * 15);
  ws.forEach((w, i) => {
    for (let c = 0; c < 5; c++) {
      out[i * 15 + c * 3] = c * 5 + w.loc[c];
      out[i * 15 + c * 3 + 1] = 25 + c * 5 + w.act[c];
      out[i * 15 + c * 3 + 2] = 50 + w.loc[c] * 5 + w.act[c];
    }
  });
  return (cellCache = out);
}
export function difficulty(clueBits: Uint32Array[]) {
  const cs = cells(),
    total = cs.length / 15;
  let marks = new Uint8Array(75).fill(1); // 1 = still possible
  let rounds = 0,
    stalled = false;
  for (;;) {
    const grid = new Uint32Array(WORDS);
    let alive = 0;
    for (let i = 0; i < total; i++) {
      let ok = true;
      for (let k = i * 15; k < i * 15 + 15; k++)
        if (!marks[cs[k]]) {
          ok = false;
          break;
        }
      if (ok) {
        grid[i >>> 5] |= 1 << (i & 31);
        alive++;
      }
    }
    if (alive === 1) break;
    const next = marks.slice();
    for (const c of clueBits) {
      const seen = new Uint8Array(75);
      for (let j = 0; j < WORDS; j++) {
        let v = grid[j] & c[j];
        while (v) {
          const b = 31 - Math.clz32(v & -v);
          v &= v - 1;
          const i = (j << 5) + b;
          for (let k = i * 15; k < i * 15 + 15; k++) seen[cs[k]] = 1;
        }
      }
      for (let k = 0; k < 75; k++) if (!seen[k]) next[k] = 0;
    }
    if (next.every((v, k) => v === marks[k])) {
      stalled = true;
      break;
    }
    marks = next;
    rounds++;
  }
  return { rounds, stalled };
}
