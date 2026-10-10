import { rng } from './random.ts';
import type { Block, BoardState } from './types.ts';
export type Slide = { block: string; x: number; y: number };
export function slide(blocks: Block[], move: Slide): Block[] | null {
  const b = blocks.find((b) => b.id === move.block);
  if (
    !b ||
    !Number.isInteger(move.x) ||
    !Number.isInteger(move.y) ||
    (b.horiz ? move.y !== b.y : move.x !== b.x) ||
    (move.x === b.x && move.y === b.y)
  )
    return null;
  const dest = b.horiz ? move.x : move.y,
    start = b.horiz ? b.x : b.y;
  if (dest < 0 || dest + b.len > 6) return null;
  const occupied = new Set(
    blocks
      .filter((q) => q.id !== b.id)
      .flatMap((q) =>
        Array.from(
          { length: q.len },
          (_, i) => (q.y + (q.horiz ? 0 : i)) * 6 + q.x + (q.horiz ? i : 0),
        ),
      ),
  );
  for (let p = Math.min(start, dest); p < Math.max(start, dest) + b.len; p++)
    if (occupied.has(b.horiz ? b.y * 6 + p : p * 6 + b.x)) return null;
  return blocks.map((q) =>
    q.id === b.id ? { ...q, x: move.x, y: move.y } : q,
  );
}
export const boardSolved = (blocks: Block[]) =>
  blocks.some((b) => b.key && b.x + b.len === 6);
export function boardMoves(blocks: Block[]) {
  const out: { move: Slide; blocks: Block[] }[] = [];
  for (const b of blocks)
    for (let p = 0; p <= 6 - b.len; p++) {
      const move = { block: b.id, x: b.horiz ? p : b.x, y: b.horiz ? b.y : p };
      const next = slide(blocks, move);
      if (next) out.push({ move, blocks: next });
    }
  return out;
}
export function solveBoard(
  blocks: Block[],
  cap = 100000,
): Slide[] | null | undefined {
  const start = blocks
    .map((b) => String.fromCharCode(48 + (b.horiz ? b.x : b.y)))
    .join('');
  const queue = [start],
    parents = [-1],
    steps: (Slide | null)[] = [null],
    seen = new Set([start]);
  const keyIndex = blocks.findIndex((b) => b.key);
  const occupied = new Int8Array(36);
  for (let i = 0; i < queue.length; i++) {
    const state = queue[i];
    if (state.charCodeAt(keyIndex) - 48 === 4) {
      const path: Slide[] = [];
      for (let j = i; parents[j] >= 0; j = parents[j]) path.push(steps[j]!);
      return path.reverse();
    }
    if (seen.size > cap) return undefined;
    occupied.fill(-1);
    for (let j = 0; j < blocks.length; j++) {
      const b = blocks[j],
        pos = state.charCodeAt(j) - 48;
      for (let n = 0; n < b.len; n++)
        occupied[b.horiz ? b.y * 6 + pos + n : (pos + n) * 6 + b.x] = j;
    }
    for (let j = 0; j < blocks.length; j++) {
      const b = blocks[j],
        pos = state.charCodeAt(j) - 48;
      for (const dir of [-1, 1])
        for (let p = pos + dir; p >= 0 && p + b.len <= 6; p += dir) {
          const edge = dir < 0 ? p : p + b.len - 1;
          if (occupied[b.horiz ? b.y * 6 + edge : edge * 6 + b.x] !== -1) break;
          const next =
            state.slice(0, j) +
            String.fromCharCode(48 + p) +
            state.slice(j + 1);
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
          parents.push(i);
          steps.push({
            block: b.id,
            x: b.horiz ? p : b.x,
            y: b.horiz ? b.y : p,
          });
        }
    }
  }
  return null;
}
export function boardCandidate(
  seed: string,
  members: number,
  attempt: number,
): BoardState | null {
  const random = rng(`${seed}:${attempt}`),
    target = members * 4;
  // Geometry is generated from nonoverlapping wreckage, then certified by BFS.
  // Reversible slides retain reachability; no fixed catalog of game instances.
  const blocks: Block[] = [
    { id: 'key', kind: 'carriage', x: 0, y: 2, len: 2, horiz: true, key: true },
  ];
  const occupied = new Set([12, 13]);
  for (let i = 0; i < 12; i++) {
    for (let tries = 0; tries < 25; tries++) {
      const horiz = random() < 0.5,
        len = (random() < 0.3 ? 3 : 2) as 2 | 3;
      const x = Math.floor(random() * (horiz ? 7 - len : 6)),
        y = Math.floor(random() * (horiz ? 6 : 7 - len));
      const cells = Array.from(
        { length: len },
        (_, k) => (y + (horiz ? 0 : k)) * 6 + x + (horiz ? k : 0),
      );
      if (cells.some((c) => occupied.has(c))) continue;
      cells.forEach((c) => occupied.add(c));
      const kinds =
        len === 2
          ? (['wood', 'crates', 'car'] as const)
          : (['tree', 'brick', 'coach'] as const);
      blocks.push({
        id: `b${i}`,
        kind: kinds[Math.floor(random() * 3)],
        x,
        y,
        len,
        horiz,
      });
      break;
    }
  }
  const solution = solveBoard(blocks, 12000);
  if (solution && solution.length >= target) {
    let candidate = blocks;
    for (const move of solution.slice(0, solution.length - target))
      candidate = slide(candidate, move)!;
    return {
      type: 'board',
      blocks: candidate,
      original: structuredClone(candidate),
      par: target,
      distance: target,
      solved: false,
    };
  }
  return null;
}
export function generateBoard(seed: string, members: number): BoardState {
  for (let attempt = 0; attempt < 20000; attempt++) {
    const candidate = boardCandidate(seed, members, attempt);
    if (candidate) return candidate;
  }
  throw Error(
    'Could not generate a certified Escape puzzle. Redeal the vigils.',
  );
}
