import { shuffle } from '../random.ts';
import type { Ent, Logic } from '../types.ts';
import { type World, compile, bits, popcount } from './solver.ts';
import { type R, type Pair, pick, STREET } from './prose.ts';
// ---------------------------------------------------------------------------
// Clue makers: each builds a clue that is true of a given world
// ---------------------------------------------------------------------------
export type Cat = Ent['cat'];
export const CATS: Cat[] = ['character', 'location', 'activity'];
export type Made = { logic: Logic; pattern: string; form?: string };
export function entOf(w: World, p: number, cat: Cat): Ent {
  return {
    cat,
    id: cat === 'character' ? p : cat === 'location' ? w.loc[p] : w.act[p],
  };
}
export const two = (r: R) => shuffle(CATS, r).slice(0, 2) as [Cat, Cat];
export const people = (r: R, n: number) =>
  shuffle([0, 1, 2, 3, 4], r).slice(0, n);
export function others(r: R, cat: Cat, not: number, n: number): Ent[] {
  return shuffle(
    [0, 1, 2, 3, 4].filter((x) => x !== not),
    r,
  )
    .slice(0, n)
    .map((id) => ({ cat, id }));
}
export function isFact(r: R, w: World): Pair {
  const p = Math.floor(r() * 5),
    [ca, cb] = two(r);
  return { t: 'is', a: entOf(w, p, ca), b: entOf(w, p, cb) };
}
export function notFact(r: R, w: World): Pair {
  const [p, q] = people(r, 2),
    [ca, cb] = two(r);
  return { t: 'not', a: entOf(w, p, ca), b: entOf(w, q, cb) };
}
export const MAKERS: Record<string, (r: R, w: World) => Made | null> = {
  direct: (r, w) => ({ logic: isFact(r, w), pattern: 'direct' }),
  negative: (r, w) => ({ logic: notFact(r, w), pattern: 'negative' }),
  eitherOr: (r, w) => {
    const p = Math.floor(r() * 5),
      [ca, cb] = two(r),
      b = entOf(w, p, cb);
    return {
      logic: {
        t: 'oneOf',
        a: entOf(w, p, ca),
        bs: shuffle([b, ...others(r, cb, b.id, 1)], r),
      },
      pattern: 'either-or',
    };
  },
  oneOfThree: (r, w) => {
    const p = Math.floor(r() * 5),
      [ca, cb] = two(r),
      b = entOf(w, p, cb);
    return {
      logic: {
        t: 'oneOf',
        a: entOf(w, p, ca),
        bs: shuffle([b, ...others(r, cb, b.id, 2)], r),
      },
      pattern: 'one-of-three',
    };
  },
  neitherNor: (r, w) => {
    const p = Math.floor(r() * 5),
      [ca, cb] = two(r);
    return {
      logic: {
        t: 'none',
        a: entOf(w, p, ca),
        bs: others(r, cb, entOf(w, p, cb).id, 2),
      },
      pattern: 'neither-nor',
    };
  },
  exclusivePair: (r, w) => {
    // "Of A and B, one was X and the other was Y" (X, Y in different categories)
    const [p, q] = people(r, 2),
      cats = shuffle(CATS, r);
    const [ca, c1, c2] = cats;
    return {
      logic: {
        t: 'set',
        as: [entOf(w, p, ca), entOf(w, q, ca)],
        bs: shuffle([entOf(w, p, c1), entOf(w, q, c2)], r),
      },
      pattern: 'exclusive-pairing',
    };
  },
  setMembership: (r, w) => {
    const n = r() < 0.5 ? 2 : 3,
      ps = people(r, n),
      [ca, cb] = two(r);
    return {
      logic: {
        t: 'set',
        as: ps.map((p) => entOf(w, p, ca)),
        bs: shuffle(
          ps.map((p) => entOf(w, p, cb)),
          r,
        ),
      },
      pattern: 'set-membership',
    };
  },
  threeWay: (r, w) => {
    const [p, q, s] = people(r, 3),
      cats = shuffle(CATS, r);
    return {
      logic: {
        t: 'distinct',
        es: [entOf(w, p, cats[0]), entOf(w, q, cats[1]), entOf(w, s, cats[2])],
      },
      pattern: 'three-way',
    };
  },
  crossCategory: (r, w) => {
    // Someone was <act> <in place>, but it wasn't the <character>, and kin.
    const [p, q] = people(r, 2),
      form = pick(r, ['someone', 'but-not-act', 'but-not-loc']);
    const c = { cat: 'character', id: p } as Ent;
    if (form === 'someone')
      return {
        logic: {
          t: 'and',
          p: {
            t: 'is',
            a: entOf(w, p, 'location'),
            b: entOf(w, p, 'activity'),
          },
          q: {
            t: 'not',
            a: { cat: 'character', id: q },
            b: entOf(w, p, 'location'),
          },
        },
        pattern: 'cross-category',
        form,
      };
    if (form === 'but-not-act')
      return {
        logic: {
          t: 'and',
          p: { t: 'is', a: c, b: entOf(w, p, 'location') },
          q: { t: 'not', a: c, b: entOf(w, q, 'activity') },
        },
        pattern: 'cross-category',
        form,
      };
    return {
      logic: {
        t: 'and',
        p: { t: 'is', a: c, b: entOf(w, p, 'activity') },
        q: { t: 'not', a: c, b: entOf(w, q, 'location') },
      },
      pattern: 'cross-category',
      form,
    };
  },
  compound: (r, w) => {
    const p = r() < 0.4 ? isFact(r, w) : notFact(r, w);
    const q = notFact(r, w);
    return { logic: { t: 'and', p, q }, pattern: 'compound' };
  },
  exclusiveOr: (r, w) => {
    const yes = isFact(r, w),
      [p, q] = people(r, 2),
      [ca, cb] = two(r);
    const no: Logic = { t: 'is', a: entOf(w, p, ca), b: entOf(w, q, cb) };
    const ents = (l: Logic) => (l.t === 'is' ? [l.a, l.b] : []);
    // The two halves must be about different people and things.
    if (
      ents(no).some((e) =>
        ents(yes).some((f) => f.cat === e.cat && f.id === e.id),
      )
    )
      return null;
    return {
      logic:
        r() < 0.5 ? { t: 'xor', p: yes, q: no } : { t: 'xor', p: no, q: yes },
      pattern: 'either-or-not-both',
    };
  },
  conditional: (r, w) => {
    const truth = r() < 0.5;
    const p: Logic = truth
      ? isFact(r, w)
      : (() => {
          const [x, y] = people(r, 2),
            [ca, cb] = two(r);
          return { t: 'is', a: entOf(w, x, ca), b: entOf(w, y, cb) } as Logic;
        })();
    const q: Logic = truth || r() < 0.5 ? isFact(r, w) : notFact(r, w);
    return { logic: { t: 'if', p, q }, pattern: 'conditional' };
  },
  relational: (r, w) => {
    const [p, q] = people(r, 2);
    const a = entOf(w, p, pick(r, ['character', 'activity'] as Cat[])),
      b = entOf(w, q, pick(r, CATS));
    const pa = w.loc[p],
      pb = w.loc[q],
      d = Math.abs(pa - pb);
    const [west, east] = pa < pb ? [a, b] : [b, a];
    const options: Logic[] = [{ t: 'rel', a: west, b: east, r: 'west' }];
    if (d === 1)
      options.push(
        { t: 'rel', a, b, r: 'next' },
        { t: 'rel', a: west, b: east, r: 'westBy', n: 1 },
      );
    else {
      options.push(
        { t: 'rel', a, b, r: 'apart' },
        { t: 'rel', a, b, r: 'gap', n: d },
      );
      if (d === 2)
        options.push({ t: 'rel', a: west, b: east, r: 'westBy', n: 2 });
    }
    return { logic: pick(r, options), pattern: 'relational' };
  },
  street: (r, w) => {
    const p = Math.floor(r() * 5),
      a = entOf(w, p, pick(r, ['character', 'activity'] as Cat[]));
    const sets = Object.keys(STREET)
      .map((k) => k.split(',').map(Number))
      .filter((ps) => ps.includes(w.loc[p]) && ps.length > 1);
    return {
      logic: { t: 'at', a, ps: pick(r, sets) },
      pattern: 'street-position',
    };
  },
};
// Relative frequency of each clue pattern in hard riddles.
export const WEIGHTS: Record<string, number> = {
  direct: 0.25,
  negative: 0.8,
  eitherOr: 1,
  oneOfThree: 0.8,
  neitherNor: 0.9,
  exclusivePair: 1.1,
  setMembership: 1,
  threeWay: 0.8,
  crossCategory: 0.9,
  compound: 0.6,
  exclusiveOr: 0.8,
  conditional: 0.55,
  relational: 2,
  street: 0.6,
};
export const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b);
export function randomMaker(r: R) {
  let x = r() * TOTAL;
  for (const [k, v] of Object.entries(WEIGHTS)) if ((x -= v) < 0) return k;
  return 'relational';
}
export type Card = Made & { key: string; bits: Uint32Array; count: number };
export function makeCard(r: R, w: World, kind = randomMaker(r)): Card | null {
  const made = MAKERS[kind](r, w);
  if (!made) return null;
  const pred = compile(made.logic);
  if (!pred(w)) return null;
  const b = bits(pred),
    count = popcount(b);
  // Skip clues that say (almost) nothing or that give away a whole row.
  if (count > 14400 * 0.9 || count < 14400 * 0.04) return null;
  return { ...made, key: JSON.stringify(made.logic), bits: b, count };
}
