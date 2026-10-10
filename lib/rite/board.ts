import { rng } from './random.ts';
import type { Block, BoardState } from './types.ts';
import { BOARD_LAYOUTS } from './board-layouts.ts';
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
export const BOARD_PAR = [28, 32] as const;
type Field = { states: string[]; dist: Int16Array };
// Every position reachable from `blocks`, with its optimal distance to escape.
export function boardField(blocks: Block[], cap = 40000): Field | null {
  const start = blocks
    .map((b) => String.fromCharCode(48 + (b.horiz ? b.x : b.y)))
    .join('');
  const states = [start],
    index = new Map([[start, 0]]),
    keyIndex = blocks.findIndex((b) => b.key),
    occupied = new Int8Array(36);
  const neighbours = (state: string, visit: (next: string) => void) => {
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
          visit(
            state.slice(0, j) +
              String.fromCharCode(48 + p) +
              state.slice(j + 1),
          );
        }
    }
  };
  for (let i = 0; i < states.length; i++) {
    if (states.length > cap) return null;
    neighbours(states[i], (next) => {
      if (!index.has(next)) {
        index.set(next, states.length);
        states.push(next);
      }
    });
  }
  // Slides are reversible, so a breadth-first sweep out from every escaped
  // position gives each position its optimal number of slides.
  const dist = new Int16Array(states.length).fill(-1),
    queue: number[] = [];
  states.forEach((s, i) => {
    if (s.charCodeAt(keyIndex) - 48 + blocks[keyIndex].len === 6) {
      dist[i] = 0;
      queue.push(i);
    }
  });
  for (let h = 0; h < queue.length; h++) {
    const d = dist[queue[h]];
    neighbours(states[queue[h]], (next) => {
      const k = index.get(next)!;
      if (dist[k] < 0) {
        dist[k] = d + 1;
        queue.push(k);
      }
    });
  }
  return { states, dist };
}
const SKINS = {
  2: ['wood', 'crates', 'car'],
  3: ['tree', 'brick', 'coach'],
} as const;
export function boardCandidate(
  seed: string,
  _members: number,
  attempt: number,
): BoardState | null {
  // Every vigil, whatever its size, gets a hard board: a position 28-32
  // optimal slides from escape, drawn from a certified seed layout's cluster.
  const random = rng(`${seed}:${attempt}`);
  const layout =
    BOARD_LAYOUTS[Math.floor(random() * BOARD_LAYOUTS.length)].split(' ');
  const base: Block[] = layout.map((code, i) => {
    const len = Number(code[2]) as 2 | 3;
    return i === 0
      ? {
          id: 'key',
          kind: 'carriage',
          x: +code[0],
          y: +code[1],
          len,
          horiz: true,
          key: true,
        }
      : {
          id: `b${i - 1}`,
          kind: SKINS[len][Math.floor(random() * 3)],
          x: +code[0],
          y: +code[1],
          len,
          horiz: code[3] === 'h',
        };
  });
  const field = boardField(base);
  if (!field) return null;
  const deepest = Math.max(...field.dist);
  if (deepest < BOARD_PAR[0]) return null;
  const target = Math.min(
    deepest,
    BOARD_PAR[0] + Math.floor(random() * (BOARD_PAR[1] - BOARD_PAR[0] + 1)),
  );
  const starts = field.states.filter((_, i) => field.dist[i] === target);
  const start = starts[Math.floor(random() * starts.length)];
  const blocks = base.map((b, j) => {
    const p = start.charCodeAt(j) - 48;
    return b.horiz ? { ...b, x: p } : { ...b, y: p };
  });
  return {
    type: 'board',
    blocks,
    original: structuredClone(blocks),
    par: target,
    distance: target,
    solved: false,
  };
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
