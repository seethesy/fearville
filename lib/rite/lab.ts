import { rng, shuffle } from './random.ts';
import type { Vial, LabState } from './types.ts';
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
const key = (vials: Vial[]) =>
  vials
    .map((v) => v.layers.join(''))
    .sort()
    .join('|');
function neighbors(vials: Vial[]) {
  const out: { vials: Vial[]; move: Pour }[] = [];
  for (const from of vials)
    for (const to of vials) {
      // A monochrome vial transferred wholesale to an empty one is symmetric.
      if (!to.layers.length && from.layers.every((c) => c === from.layers[0]))
        continue;
      const move = { from: from.id, to: to.id },
        next = pour(vials, move);
      if (next) out.push({ vials: next, move });
    }
  return out;
}
function heuristic(vials: Vial[]) {
  // Every boundary between unlike liquids must be removed by at least a pour.
  return vials.reduce(
    (n, v) =>
      n + v.layers.filter((c, i) => i > 0 && c !== v.layers[i - 1]).length,
    0,
  );
}
export function solveLab(
  vials: Vial[],
  cap = 60000,
): Pour[] | null | undefined {
  // A* with an admissible boundary heuristic. Canonical vial keys remove shape
  // and empty-vial permutations, while paths retain real vial identifiers.
  const heap: { vials: Vial[]; path: Pour[]; f: number }[] = [];
  const push = (q: (typeof heap)[number]) => {
    heap.push(q);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= q.f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = q;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
        if (heap[c].f >= last.f) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  push({ vials, path: [], f: heuristic(vials) });
  const best = new Map([[key(vials), 0]]);
  while (heap.length) {
    const q = pop();
    if (q.path.length !== best.get(key(q.vials))) continue;
    if (labSolved(q.vials)) return q.path;
    if (best.size > cap) return undefined;
    for (const n of neighbors(q.vials)) {
      const k = key(n.vials),
        d = q.path.length + 1;
      if (d >= (best.get(k) ?? Infinity)) continue;
      best.set(k, d);
      push({
        vials: n.vials,
        path: [...q.path, n.move],
        f: d + heuristic(n.vials),
      });
    }
  }
  return null;
}
export function labCandidate(
  seed: string,
  members: number,
  attempt: number,
): LabState | null {
  const random = rng(`${seed}:${attempt}`),
    target = members * 4,
    colors = members * 2;
  let vials: Vial[] = Array.from({ length: colors + 2 }, (_, i) => ({
    id: `v${i}`,
    shape: Math.floor(random() * 7),
    layers: i < colors ? Array(4).fill(i) : [],
  }));
  for (let depth = 0; depth < target + 12; depth++) {
    const reverse: Vial[][] = [];
    for (const from of vials)
      for (const to of vials) {
        if (from === to || !from.layers.length || to.layers.length === 4)
          continue;
        const c = from.layers.at(-1)!;
        for (
          let n = 1;
          n <= Math.min(from.layers.length, 4 - to.layers.length);
          n++
        ) {
          if (!from.layers.slice(-n).every((x) => x === c)) break;
          const next = vials.map((v) =>
            v === from
              ? { ...v, layers: v.layers.slice(0, -n) }
              : v === to
                ? { ...v, layers: [...v.layers, ...Array(n).fill(c)] }
                : v,
          );
          const restored = pour(next, { from: to.id, to: from.id });
          if (
            restored &&
            restored.every(
              (v, i) => v.layers.join(',') === vials[i].layers.join(','),
            )
          )
            reverse.push(next);
        }
      }
    if (!reverse.length) break;
    const options = shuffle(reverse, random).sort(
      (a, b) => heuristic(b) - heuristic(a),
    );
    vials = options[Math.floor(random() * Math.min(4, options.length))];
  }
  const solution = solveLab(vials, 4000);
  if (solution && solution.length >= target) {
    for (const move of solution.slice(0, solution.length - target))
      vials = pour(vials, move)!;
    const palette = shuffle(
      Array.from({ length: 8 }, (_, i) => i),
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
  return null;
}
export function generateLab(seed: string, members: number): LabState {
  for (let attempt = 0; attempt < 20000; attempt++) {
    const candidate = labCandidate(seed, members, attempt);
    if (candidate) return candidate;
  }
  throw Error(
    'Could not generate a certified Laboratory puzzle. Redeal the vigils.',
  );
}
