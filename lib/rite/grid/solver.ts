import type { Triple, Clue, Ent, Logic } from '../types.ts';
import { satisfies } from './vocabulary.ts';
// ---------------------------------------------------------------------------
// Logic: every clue is a small formula over "who is who" and street positions
// ---------------------------------------------------------------------------
// A world lists, per character, their location and activity, plus inverses.
export type World = {
  loc: number[];
  act: number[];
  atLoc: number[];
  atAct: number[];
};
export function world(loc: number[], act: number[]): World {
  const atLoc = [0, 0, 0, 0, 0],
    atAct = [0, 0, 0, 0, 0];
  loc.forEach((l, c) => (atLoc[l] = c));
  act.forEach((a, c) => (atAct[a] = c));
  return { loc, act, atLoc, atAct };
}
export const worldOf = (solution: Triple[]) => {
  const loc = [0, 0, 0, 0, 0],
    act = [0, 0, 0, 0, 0];
  for (const t of solution) {
    loc[t.character] = t.location;
    act[t.character] = t.activity;
  }
  return world(loc, act);
};
export type Pred = (w: World) => boolean;
export type Num = (w: World) => number;
// Whose row an entity belongs to (characters index the rows).
export function person(e: Ent): Num {
  const id = e.id;
  return e.cat === 'character'
    ? () => id
    : e.cat === 'location'
      ? (w) => w.atLoc[id]
      : (w) => w.atAct[id];
}
// Street position (0 = west end) of the entity's person, or of the place.
export function position(e: Ent): Num {
  if (e.cat === 'location') {
    const id = e.id;
    return () => id;
  }
  const p = person(e);
  return (w) => w.loc[p(w)];
}
export function compile(l: Logic): Pred {
  switch (l.t) {
    case 'is':
    case 'not': {
      const a = person(l.a),
        b = person(l.b),
        want = l.t === 'is';
      return (w) => (a(w) === b(w)) === want;
    }
    case 'oneOf':
    case 'none': {
      const a = person(l.a),
        bs = l.bs.map(person),
        want = l.t === 'oneOf';
      return (w) => {
        const p = a(w);
        return bs.some((b) => b(w) === p) === want;
      };
    }
    case 'set': {
      // Same people on both sides, and the right-hand side names distinct people.
      const as = l.as.map(person),
        bs = l.bs.map(person),
        n = bs.length;
      return (w) => {
        let x = 0,
          y = 0,
          k = 0;
        for (const f of as) x |= 1 << f(w);
        for (const f of bs) {
          const bit = 1 << f(w);
          if (!(y & bit)) k++;
          y |= bit;
        }
        return k === n && x === y;
      };
    }
    case 'distinct': {
      const es = l.es.map(person),
        n = es.length;
      return (w) => {
        let y = 0,
          k = 0;
        for (const f of es) {
          const bit = 1 << f(w);
          if (!(y & bit)) k++;
          y |= bit;
        }
        return k === n;
      };
    }
    case 'and': {
      const p = compile(l.p),
        q = compile(l.q);
      return (w) => p(w) && q(w);
    }
    case 'xor': {
      const p = compile(l.p),
        q = compile(l.q);
      return (w) => p(w) !== q(w);
    }
    case 'if': {
      const p = compile(l.p),
        q = compile(l.q);
      return (w) => !p(w) || q(w);
    }
    case 'rel': {
      const a = position(l.a),
        b = position(l.b),
        n = l.n ?? 1;
      if (l.r === 'next') return (w) => Math.abs(a(w) - b(w)) === 1;
      if (l.r === 'apart') return (w) => Math.abs(a(w) - b(w)) >= 2;
      if (l.r === 'west') return (w) => a(w) < b(w);
      if (l.r === 'westBy') return (w) => b(w) - a(w) === n;
      return (w) => Math.abs(a(w) - b(w)) === n;
    }
    case 'at': {
      const a = position(l.a),
        ps = l.ps;
      return (w) => ps.includes(a(w));
    }
  }
}
export function clueHolds(
  solution: Triple[],
  clue: Pick<Clue, 'facts' | 'logic'>,
) {
  return clue.logic
    ? compile(clue.logic)(worldOf(solution))
    : satisfies(solution, clue.facts ?? []);
}
// Every possible answer: 120 location orders x 120 activity orders.
export function permutations(items: number[]): number[][] {
  return items.length
    ? items.flatMap((x, i) =>
        permutations(items.filter((_, j) => i !== j)).map((p) => [x, ...p]),
      )
    : [[]];
}
export const PERMS = permutations([0, 1, 2, 3, 4]);
export let worldCache: World[] | undefined;
export function worlds() {
  return (worldCache ??= PERMS.flatMap((loc) =>
    PERMS.map((act) => world(loc, act)),
  ));
}
export const WORDS = 450;
// 14400 worlds / 32 bits
export function bits(pred: Pred) {
  const ws = worlds(),
    out = new Uint32Array(WORDS);
  for (let i = 0; i < ws.length; i++)
    if (pred(ws[i])) out[i >>> 5] |= 1 << (i & 31);
  return out;
}
export function popcount(a: Uint32Array) {
  let n = 0;
  for (let v of a) {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    n += (((v + (v >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
  }
  return n;
}
export function and(a: Uint32Array, b: Uint32Array) {
  const out = new Uint32Array(WORDS);
  for (let i = 0; i < WORDS; i++) out[i] = a[i] & b[i];
  return out;
}
export const toTriples = (w: World): Triple[] =>
  w.loc.map((location, character) => ({
    character,
    location,
    activity: w.act[character],
  }));
export function solveGrid(
  clues: Pick<Clue, 'facts' | 'logic'>[],
  stopAfter = 2,
) {
  const preds = clues.map((c) =>
    c.logic
      ? compile(c.logic)
      : (w: World) => satisfies(toTriples(w), c.facts ?? []),
  );
  const out: Triple[][] = [];
  for (const w of worlds())
    if (preds.every((p) => p(w))) {
      out.push(toTriples(w));
      if (out.length >= stopAfter) return out;
    }
  return out;
}
