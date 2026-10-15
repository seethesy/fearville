import { rng, shuffle } from './random.ts';
import type { Vial, LabState } from './types.ts';
import {
  GENERATOR_STYLE as style,
  PUZZLE_PRESETS,
  DEFAULT_PRESET,
  type PuzzlePreset,
} from './generator-config.ts';
export type Pour = { from: string; to: string };
export function pour(vials: Vial[], move: Pour): Vial[] | null {
  const from = vials.find((v) => v.id === move.from),
    to = vials.find((v) => v.id === move.to);
  if (
    !from ||
    !to ||
    from === to ||
    !from.layers.length ||
    to.layers.length >= 4
  )
    return null;
  const color = from.layers.at(-1)!;
  if (to.layers.length && to.layers.at(-1) !== color) return null;
  let run = 0;
  for (let i = from.layers.length - 1; i >= 0 && from.layers[i] === color; i--)
    run++;
  const n = Math.min(run, 4 - to.layers.length);
  return vials.map((v) =>
    v.id === from.id
      ? { ...v, layers: v.layers.slice(0, -n) }
      : v.id === to.id
        ? { ...v, layers: [...v.layers, ...Array(n).fill(color)] }
        : v,
  );
}
export const labSolved = (vials: Vial[]) =>
  vials.every((v) => v.layers.every((c) => c === v.layers[0]));
// Liquids as letters: a vial is a string, bottom first.
const enc = (layers: number[]) =>
  layers.map((c) => String.fromCharCode(97 + c)).join('');
function heuristic(state: string[]) {
  // A vial is done once it holds a single liquid (labSolved), and each pour
  // removes at most one boundary between unlike liquids: a lower bound.
  let n = 0;
  for (const v of state)
    for (let i = 1; i < v.length; i++) if (v[i] !== v[i - 1]) n++;
  return n;
}
export function solveLab(
  vials: Vial[],
  cap: number = style.lab.solverCap,
  deadline = Infinity,
): Pour[] | null | undefined {
  // A* with an admissible boundary heuristic. Canonical keys (sorted vial
  // contents) remove shape and empty-vial permutations, while each node
  // records the real vial identifiers of the pour that reached it.
  const ids = vials.map((v) => v.id);
  const states: string[][] = [vials.map((v) => enc(v.layers))];
  const parent = [-1],
    moves: [number, number][] = [[-1, -1]],
    depth = [0];
  const f = [heuristic(states[0])];
  const heap: number[] = [];
  // Equal estimates favour the deeper path, which reaches a solution sooner.
  const before = (a: number, b: number) =>
    f[a] < f[b] || (f[a] === f[b] && depth[a] >= depth[b]);
  const push = (n: number) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (before(heap[p], n)) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && before(heap[c + 1], heap[c])) c++;
        if (!before(heap[c], last)) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  const key = (state: string[]) => [...state].sort().join('|');
  const best = new Map([[key(states[0]), 0]]);
  push(0);
  while (heap.length) {
    if (performance.now() >= deadline) return undefined;
    const node = pop(),
      state = states[node],
      g = depth[node];
    if (best.get(key(state)) !== g) continue;
    if (f[node] === g) {
      // h = 0: every vial holds a single liquid, so the lab is solved.
      const path: Pour[] = [];
      for (let n = node; parent[n] >= 0; n = parent[n])
        path.push({ from: ids[moves[n][0]], to: ids[moves[n][1]] });
      return path.reverse();
    }
    if (best.size > cap) return undefined;
    const firstEmpty = state.findIndex((v) => !v.length);
    for (let i = 0; i < state.length; i++) {
      const v = state[i];
      if (!v.length) continue;
      const top = v[v.length - 1];
      let run = 1;
      while (run < v.length && v[v.length - 1 - run] === top) run++;
      for (let j = 0; j < state.length; j++) {
        const w = state[j];
        if (j === i || w.length >= 4) continue;
        if (!w.length) {
          // Moving a whole single-liquid vial into an empty one changes
          // nothing, and every empty vial is alike, so try only the first.
          if (run === v.length || j !== firstEmpty) continue;
        } else if (w[w.length - 1] !== top) continue;
        const n = Math.min(run, 4 - w.length);
        const next = state.slice();
        next[i] = v.slice(0, v.length - n);
        next[j] = w + top.repeat(n);
        const k = key(next),
          d = g + 1;
        if (d >= (best.get(k) ?? Infinity)) continue;
        best.set(k, d);
        const id = states.length;
        states.push(next);
        parent.push(node);
        moves.push([i, j]);
        depth.push(d);
        f.push(d + heuristic(next));
        push(id);
      }
    }
  }
  return null;
}
// Every vigil, whatever its size, gets a hard laboratory: ten liquids in
// twelve vials, certified at 28-32 pours by an optimal solver.
export const LAB_COLORS = PUZZLE_PRESETS.normal.lab.colors;
export const LAB_EMPTY = PUZZLE_PRESETS.normal.lab.empty;
export const LAB_PAR = PUZZLE_PRESETS.normal.lab.par;
export function labCandidate(
  seed: string,
  _members: number,
  attempt: number,
  preset: PuzzlePreset = DEFAULT_PRESET,
): LabState | null {
  const { colors, empty, par } = PUZZLE_PRESETS[preset].lab;
  const random = rng(`${seed}:${attempt}`);
  const units = shuffle(
    Array.from({ length: colors * style.lab.layers }, (_, i) =>
      Math.floor(i / style.lab.layers),
    ),
    random,
  );
  let vials: Vial[] = Array.from({ length: colors + empty }, (_, i) => ({
    id: `v${i}`,
    shape: Math.floor(random() * style.lab.shapes),
    layers:
      i < colors
        ? units.slice(i * style.lab.layers, (i + 1) * style.lab.layers)
        : [],
  }));
  const solution = solveLab(vials, style.lab.certificationCap);
  if (!solution || solution.length < par[0]) return null;
  // Playing the first optimal pours leaves a position exactly `target` away.
  const target = Math.min(
    solution.length,
    par[0] + Math.floor(random() * (par[1] - par[0] + 1)),
  );
  for (const move of solution.slice(0, solution.length - target))
    vials = pour(vials, move)!;
  const palette = shuffle(
    Array.from({ length: colors }, (_, i) => i),
    rng(`${seed}:palette`),
  );
  vials = vials.map((v) => ({
    ...v,
    layers: v.layers.map((c) => palette[c]),
  }));
  return {
    type: 'lab',
    vials,
    original: structuredClone(vials),
    nightStart: structuredClone(vials),
    par: target,
    distance: target,
    solved: false,
    history: [],
  };
}
export function generateLab(
  seed: string,
  members: number,
  preset: PuzzlePreset = DEFAULT_PRESET,
): LabState {
  for (let attempt = 0; attempt < style.lab.maxAttempts; attempt++) {
    const candidate = labCandidate(seed, members, attempt, preset);
    if (candidate) return candidate;
  }
  throw Error(
    'Could not generate a certified Laboratory puzzle. Redeal the vigils.',
  );
}
