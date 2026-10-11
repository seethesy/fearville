import { rng, shuffle } from './random.ts';
import type { Triple, Fact, Clue, GridState, Ent, Logic } from './types.ts';
export const CHARACTERS = [
  'Watchman',
  'Doctor',
  'Librarian',
  'Detective',
  'Mortician',
];
// The five places stand along one street in this order, west to east.
export const LOCATIONS = ['Library', 'Garden', 'House', 'Market', 'Graveyard'];
export const ACTIVITIES = [
  'Reading',
  'Eating',
  'Biking',
  'Shopping',
  'Sleeping',
];
export const CLUES_PER_PLAYER = 4;
const names = {
  character: CHARACTERS,
  location: LOCATIONS,
  activity: ACTIVITIES,
};

// ---------------------------------------------------------------------------
// Legacy single-fact clues (kept so games dealt before this change still load)
// ---------------------------------------------------------------------------
export function clueText(facts: Fact[]) {
  return (
    facts
      .map(
        (f) =>
          `The ${names[f.a][f.x]} ${f.not ? 'was not linked to' : 'was linked to'} ${f.ys.map((y) => names[f.b][y]).join(' or ')}`,
      )
      .join(' and ') + '.'
  );
}
export function satisfies(solution: Triple[], facts: Fact[]) {
  return facts.every((f) => {
    const row = solution.find((t) => t[f.a] === f.x)!;
    return f.not ? !f.ys.includes(row[f.b]) : f.ys.includes(row[f.b]);
  });
}

// ---------------------------------------------------------------------------
// Logic: every clue is a small formula over "who is who" and street positions
// ---------------------------------------------------------------------------
// A world lists, per character, their location and activity, plus inverses.
type World = {
  loc: number[];
  act: number[];
  atLoc: number[];
  atAct: number[];
};
function world(loc: number[], act: number[]): World {
  const atLoc = [0, 0, 0, 0, 0],
    atAct = [0, 0, 0, 0, 0];
  loc.forEach((l, c) => (atLoc[l] = c));
  act.forEach((a, c) => (atAct[a] = c));
  return { loc, act, atLoc, atAct };
}
const worldOf = (solution: Triple[]) => {
  const loc = [0, 0, 0, 0, 0],
    act = [0, 0, 0, 0, 0];
  for (const t of solution) {
    loc[t.character] = t.location;
    act[t.character] = t.activity;
  }
  return world(loc, act);
};
type Pred = (w: World) => boolean;
type Num = (w: World) => number;
// Whose row an entity belongs to (characters index the rows).
function person(e: Ent): Num {
  const id = e.id;
  return e.cat === 'character'
    ? () => id
    : e.cat === 'location'
      ? (w) => w.atLoc[id]
      : (w) => w.atAct[id];
}
// Street position (0 = west end) of the entity's person, or of the place.
function position(e: Ent): Num {
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
function permutations(items: number[]): number[][] {
  return items.length
    ? items.flatMap((x, i) =>
        permutations(items.filter((_, j) => i !== j)).map((p) => [x, ...p]),
      )
    : [[]];
}
const PERMS = permutations([0, 1, 2, 3, 4]);
let worldCache: World[] | undefined;
function worlds() {
  return (worldCache ??= PERMS.flatMap((loc) =>
    PERMS.map((act) => world(loc, act)),
  ));
}
const WORDS = 450; // 14400 worlds / 32 bits
function bits(pred: Pred) {
  const ws = worlds(),
    out = new Uint32Array(WORDS);
  for (let i = 0; i < ws.length; i++)
    if (pred(ws[i])) out[i >>> 5] |= 1 << (i & 31);
  return out;
}
function popcount(a: Uint32Array) {
  let n = 0;
  for (let v of a) {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    n += (((v + (v >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24;
  }
  return n;
}
function and(a: Uint32Array, b: Uint32Array) {
  const out = new Uint32Array(WORDS);
  for (let i = 0; i < WORDS; i++) out[i] = a[i] & b[i];
  return out;
}
const toTriples = (w: World): Triple[] =>
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

// ---------------------------------------------------------------------------
// Difficulty: how a solver that reasons one clue at a time on the grid fares
// ---------------------------------------------------------------------------
// The knowledge state is the three cross-off grids (character-location,
// character-activity, location-activity). Each round, every clue is combined
// with the current grids alone, and any pairing impossible under that clue is
// crossed off. Easy puzzles fall to a few rounds of this; hard ones need many
// rounds, or stall entirely and demand combining several clues at once.
let cellCache: Uint8Array | undefined;
// For each world, the 15 grid cells it uses (5 people x 3 pairings).
function cells() {
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

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------
type R = () => number;
type Pair = { t: 'is' | 'not'; a: Ent; b: Ent };
const pick = <T>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const IN = [
  'in the Library',
  'in the Garden',
  'at the House',
  'at the Market',
  'in the Graveyard',
];
const PLACE = LOCATIONS.map((l) => `the ${l}`);
const GERUND = ['reading', 'eating', 'biking', 'shopping', 'sleeping'];
const ACT_NOUN = [
  ['the reader', 'whoever was reading', 'the person who was reading'],
  ['whoever was eating', 'the person who was eating', 'the one eating'],
  ['the cyclist', 'whoever was biking', 'the person out biking'],
  ['the shopper', 'whoever was shopping', 'the person out shopping'],
  ['the sleeper', 'whoever was sleeping', 'the person who was asleep'],
];
const ACT_YES = [
  ['was reading', 'spent the night reading', 'had their nose in a book'],
  ['was eating', 'spent the night eating', 'was having a meal'],
  ['was biking', 'spent the night biking', 'was out on a bike'],
  ['was shopping', 'spent the night shopping', 'was out shopping'],
  ['was sleeping', 'spent the night asleep', 'was fast asleep'],
];
const ACT_NO = [
  ['wasn’t reading', 'wasn’t the one reading', 'never opened a book'],
  ['wasn’t eating', 'wasn’t the one eating', 'didn’t eat a thing'],
  ['wasn’t biking', 'wasn’t the cyclist', 'never got on a bike'],
  ['wasn’t shopping', 'wasn’t the shopper', 'did no shopping'],
  ['wasn’t sleeping', 'wasn’t the sleeper', 'didn’t sleep a wink'],
];
function noun(r: R, e: Ent) {
  if (e.cat === 'character') return `the ${CHARACTERS[e.id]}`;
  if (e.cat === 'location')
    return pick(r, [`whoever was ${IN[e.id]}`, `the person ${IN[e.id]}`]);
  return pick(r, ACT_NOUN[e.id]);
}
// Object of "west of", "next door to": places are named directly.
const target = (r: R, e: Ent) =>
  e.cat === 'location' ? PLACE[e.id] : noun(r, e);
function pred(r: R, e: Ent, neg = false) {
  if (e.cat === 'character')
    return `${neg ? 'wasn’t' : 'was'} the ${CHARACTERS[e.id]}`;
  if (e.cat === 'location')
    return neg
      ? pick(r, [`wasn’t ${IN[e.id]}`, `stayed away from ${PLACE[e.id]}`])
      : pick(r, [`was ${IN[e.id]}`, `spent the night ${IN[e.id]}`]);
  return pick(r, (neg ? ACT_NO : ACT_YES)[e.id]);
}
// The bare complement used in lists: "the Doctor", "in the Garden", "reading".
function bare(e: Ent) {
  if (e.cat === 'character') return `the ${CHARACTERS[e.id]}`;
  return e.cat === 'location' ? IN[e.id] : GERUND[e.id];
}
const list = (xs: string[], joiner = 'and') =>
  xs.length < 3
    ? xs.join(` ${joiner} `)
    : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs.at(-1)}`;
// Characters read best as subjects, so put one first when there is one.
function ordered(a: Ent, b: Ent): [Ent, Ent] {
  return b.cat === 'character' && a.cat !== 'character' ? [b, a] : [a, b];
}
function simple(r: R, l: Logic): string {
  if (l.t !== 'is' && l.t !== 'not') throw Error('not a simple clue');
  const [a, b] = ordered(l.a, l.b);
  return `${noun(r, a)} ${pred(r, b, l.t === 'not')}`;
}
const STREET: Record<string, string[]> = {
  '0,4': ['at one end of the street', 'at one of the two ends of the street'],
  '2': ['in the very middle of the street', 'at the centre of the street'],
  '0,1': ['at one of the two westernmost places'],
  '3,4': ['at one of the two easternmost places'],
  '1,2,3': ['somewhere away from both ends of the street'],
  '0,1,2': ['in one of the three westernmost places'],
  '2,3,4': ['in one of the three easternmost places'],
};
function render(r: R, l: Logic, form?: string): string {
  switch (l.t) {
    case 'is':
      return `${cap(simple(r, l))}.`;
    case 'not': {
      const [a, b] = ordered(l.a, l.b);
      if (a.cat !== 'character' && r() < 0.6) {
        const [loc, act] = a.cat === 'location' ? [a, b] : [b, a];
        return pick(r, [
          `Nobody ${IN[loc.id]} was ${GERUND[act.id]}.`,
          `No one was ${GERUND[act.id]} ${IN[loc.id]}.`,
          `Whatever happened ${IN[loc.id]} that night, it wasn’t ${GERUND[act.id]}.`,
        ]);
      }
      return `${cap(simple(r, l))}.`;
    }
    case 'oneOf': {
      const A = noun(r, l.a),
        bs = l.bs.map(bare);
      if (l.bs[0].cat === 'character')
        return l.bs.length === 2
          ? pick(r, [
              `Either ${bs[0]} or ${bs[1]} ${pred(r, l.a)}.`,
              `${cap(A)} was either ${bs[0]} or ${bs[1]}.`,
            ])
          : pick(r, [
              `${cap(A)} was ${list(bs, 'or')}.`,
              `One of ${list(bs)} ${pred(r, l.a)}.`,
            ]);
      if (l.bs.length === 2)
        return pick(r, [
          `${cap(A)} was either ${bs[0]} or ${bs[1]}.`,
          `${cap(A)} was ${bs[0]} or else ${bs[1]}.`,
        ]);
      return l.bs[0].cat === 'location'
        ? pick(r, [
            `${cap(A)} was in one of three places: ${list(
              l.bs.map((b) => PLACE[b.id]),
              'or',
            )}.`,
            `${cap(A)} was ${list(bs, 'or')}.`,
          ])
        : pick(r, [
            `${cap(A)} was doing one of three things: ${list(bs, 'or')}.`,
            `${cap(A)} was ${list(bs, 'or')}.`,
          ]);
    }
    case 'none': {
      const A = noun(r, l.a),
        bs = l.bs.map(bare);
      if (l.bs[0].cat === 'character')
        return pick(r, [
          `Neither ${bs[0]} nor ${bs[1]} ${pred(r, l.a)}.`,
          `${cap(A)} was neither ${bs[0]} nor ${bs[1]}.`,
        ]);
      if (l.bs[0].cat === 'location')
        return pick(r, [
          `${cap(A)} was neither ${bs[0]} nor ${bs[1]}.`,
          `Neither ${PLACE[l.bs[0].id]} nor ${PLACE[l.bs[1].id]} was where ${A} spent the night.`,
        ]);
      return pick(r, [
        `${cap(A)} was neither ${bs[0]} nor ${bs[1]}.`,
        `${cap(A)} spent the night neither ${bs[0]} nor ${bs[1]}.`,
      ]);
    }
    case 'set': {
      const cat = l.as[0].cat;
      const subject =
        cat === 'location'
          ? `the people ${list(l.as.map((a) => IN[a.id]))}`
          : list(l.as.map((a) => noun(r, a)));
      if (l.bs[0].cat !== l.bs[1].cat)
        return pick(r, [
          `Of ${subject}, one ${pred(r, l.bs[0])} and the other ${pred(r, l.bs[1])}.`,
          `Between ${subject}, one ${pred(r, l.bs[0])}, while the other ${pred(r, l.bs[1])}.`,
        ]);
      const bs =
        l.bs[0].cat === 'location'
          ? `spent the night at ${list(l.bs.map((b) => PLACE[b.id]))}`
          : `were ${list(l.bs.map(bare))}`;
      return pick(r, [
        `${cap(subject)} ${bs}, in some order.`,
        `In some order, ${subject} ${bs}.`,
        `${cap(subject)} ${bs}, though not necessarily in that order.`,
      ]);
    }
    case 'distinct': {
      const xs = shuffle(
        l.es.map((e) => noun(r, e)),
        r,
      );
      return pick(r, [
        `${cap(list(xs))} were three different people.`,
        `No two of ${list(xs)} were the same person.`,
        `${cap(list(xs))} were all different people.`,
      ]);
    }
    case 'and': {
      if (form === 'someone') {
        const [is, not] = [l.p, l.q] as Pair[];
        const loc = is.a.cat === 'location' ? is.a : is.b,
          act = is.a.cat === 'activity' ? is.a : is.b;
        const c = not.a.cat === 'character' ? not.a : not.b;
        return pick(r, [
          `Someone was ${GERUND[act.id]} ${IN[loc.id]}, but it wasn’t the ${CHARACTERS[c.id]}.`,
          `The person ${IN[loc.id]} was ${GERUND[act.id]}, and it wasn’t the ${CHARACTERS[c.id]}.`,
        ]);
      }
      if (form === 'but-not-act') {
        const is = l.p as Pair,
          not = l.q as Pair;
        return `The ${CHARACTERS[is.a.id]} ${pred(r, is.b)} but ${pick(r, ACT_NO[not.b.id].slice(0, 2))}.`;
      }
      if (form === 'but-not-loc') {
        const is = l.p as Pair,
          not = l.q as Pair;
        return `The ${CHARACTERS[is.a.id]} ${pick(r, ACT_YES[is.b.id].slice(0, 2))}, though not ${IN[not.b.id]}.`;
      }
      const s1 = simple(r, l.p),
        s2 = simple(r, l.q);
      return l.p.t !== l.q.t
        ? `${cap(s1)}, but ${s2}.`
        : pick(r, [`${cap(s1)}, and ${s2}.`, `${cap(s1)}; also, ${s2}.`]);
    }
    case 'xor': {
      const s1 = simple(r, l.p),
        s2 = simple(r, l.q);
      return pick(r, [
        `Either ${s1} or ${s2}, but not both.`,
        `Exactly one of these is true: ${s1}; ${s2}.`,
      ]);
    }
    case 'if': {
      const s1 = simple(r, l.p),
        s2 = simple(r, l.q);
      return pick(r, [
        `If ${s1}, then ${s2}.`,
        `${cap(s2)} if ${s1}.`,
        `Assuming ${s1}, ${s2}.`,
      ]);
    }
    case 'rel': {
      const swap = r() < 0.5;
      const A = noun(r, l.a),
        B = noun(r, l.b),
        At = target(r, l.a),
        Bt = target(r, l.b);
      // A sentence must not start with a bare place ("The Market was west…").
      const aFirst = l.a.cat !== 'location',
        bFirst = l.b.cat !== 'location';
      const n = l.n ?? 1;
      if (l.r === 'next')
        return pick(r, [
          ...(aFirst ? [`${cap(A)} was right next door to ${Bt}.`] : []),
          ...(bFirst ? [`${cap(B)} spent the night next door to ${At}.`] : []),
          ...(aFirst && bFirst
            ? [`${cap(A)} and ${B} were next-door neighbours.`]
            : []),
        ]);
      if (l.r === 'apart')
        return pick(r, [
          `There was at least one place between ${At} and ${Bt}.`,
          `${cap(At)} and ${Bt} were at least two doors apart.`,
        ]);
      if (l.r === 'gap')
        return n === 4
          ? `${cap(At)} and ${Bt} were at opposite ends of the street.`
          : `Exactly ${n === 2 ? 'one place stood' : 'two places stood'} between ${At} and ${Bt}.`;
      const far =
        l.r === 'west' ? 'somewhere' : n === 1 ? 'directly' : 'two doors';
      const farE =
        l.r === 'west' ? 'somewhere' : n === 1 ? 'immediately' : 'two doors';
      if ((swap && bFirst) || !aFirst)
        return `${cap(B)} was ${farE} east of ${At}.`;
      return `${cap(A)} was ${far} west of ${Bt}.`;
    }
    case 'at': {
      const phrase = pick(r, STREET[l.ps.join(',')]);
      return pick(r, [
        `${cap(noun(r, l.a))} was ${phrase}.`,
        `${cap(noun(r, l.a))} spent the night ${phrase}.`,
      ]);
    }
  }
}

// ---------------------------------------------------------------------------
// Clue makers: each builds a clue that is true of a given world
// ---------------------------------------------------------------------------
type Cat = Ent['cat'];
const CATS: Cat[] = ['character', 'location', 'activity'];
type Made = { logic: Logic; pattern: string; form?: string };
function entOf(w: World, p: number, cat: Cat): Ent {
  return {
    cat,
    id: cat === 'character' ? p : cat === 'location' ? w.loc[p] : w.act[p],
  };
}
const two = (r: R) => shuffle(CATS, r).slice(0, 2) as [Cat, Cat];
const people = (r: R, n: number) => shuffle([0, 1, 2, 3, 4], r).slice(0, n);
function others(r: R, cat: Cat, not: number, n: number): Ent[] {
  return shuffle(
    [0, 1, 2, 3, 4].filter((x) => x !== not),
    r,
  )
    .slice(0, n)
    .map((id) => ({ cat, id }));
}
function isFact(r: R, w: World): Pair {
  const p = Math.floor(r() * 5),
    [ca, cb] = two(r);
  return { t: 'is', a: entOf(w, p, ca), b: entOf(w, p, cb) };
}
function notFact(r: R, w: World): Pair {
  const [p, q] = people(r, 2),
    [ca, cb] = two(r);
  return { t: 'not', a: entOf(w, p, ca), b: entOf(w, q, cb) };
}
const MAKERS: Record<string, (r: R, w: World) => Made | null> = {
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
const WEIGHTS: Record<string, number> = {
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
const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b);
function randomMaker(r: R) {
  let x = r() * TOTAL;
  for (const [k, v] of Object.entries(WEIGHTS)) if ((x -= v) < 0) return k;
  return 'relational';
}
type Card = Made & { key: string; bits: Uint32Array; count: number };
function makeCard(r: R, w: World, kind = randomMaker(r)): Card | null {
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

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export type GridDifficulty = { rounds: number; stalled: boolean };
function makePool(r: R, w: World) {
  const pool = new Map<string, Card>();
  for (let i = 0; i < 500 && pool.size < 110; i++) {
    const c = makeCard(r, w);
    if (c && !pool.has(c.key)) pool.set(c.key, c);
  }
  return [...pool.values()];
}
const DENSE = new Set([
  'exclusive-pairing',
  'set-membership',
  'cross-category',
]);
function buildSet(r: R, pool: Card[], size: number, floor: number) {
  const cards = shuffle(
    // Pairings, sets and cross-category cards are dense by nature; a looser
    // floor keeps them in play so every riddle mixes many patterns.
    pool.filter(
      (c) =>
        c.count >=
        (DENSE.has(c.pattern) ? Math.min(floor, 0.08) : floor) * 14400,
    ),
    r,
  );
  // Greedily add informative cards until one answer remains…
  let live = new Uint32Array(WORDS).fill(0xffffffff);
  live[WORDS - 1] = 0xffffffff;
  const chosen: Card[] = [];
  for (const c of cards) {
    // At most one direct statement and two dense cards per riddle.
    if (c.pattern === 'direct' && chosen.some((x) => x.pattern === 'direct'))
      continue;
    if (
      DENSE.has(c.pattern) &&
      chosen.filter((x) => DENSE.has(x.pattern)).length >= 2
    )
      continue;
    const next = and(live, c.bits),
      n = popcount(next);
    if (n === popcount(live)) continue;
    chosen.push(c);
    live = next;
    if (n === 1) break;
  }
  if (popcount(live) !== 1) return null;
  // …then drop any card the others already imply, so every card matters.
  for (const c of shuffle(chosen, r)) {
    const rest = chosen.filter((x) => x !== c);
    const all = rest.reduce(
      (acc, x) => and(acc, x.bits),
      new Uint32Array(WORDS).fill(0xffffffff),
    );
    if (popcount(all) === 1) chosen.splice(chosen.indexOf(c), 1);
  }
  if (chosen.length > size) return null;
  // Top up with extra (redundant but truthful) cards, varied in pattern.
  const used = new Set(chosen.map((c) => c.key));
  const spare = cards
    .filter(
      (c) =>
        !used.has(c.key) &&
        c.pattern !== 'direct' &&
        !DENSE.has(c.pattern) &&
        c.count >= 0.35 * 14400,
    )
    .sort(
      (a, b) =>
        chosen.filter((c) => c.pattern === a.pattern).length -
          chosen.filter((c) => c.pattern === b.pattern).length ||
        b.count - a.count,
    );
  const needed = size - chosen.length;
  return { essential: chosen, extra: spare.slice(0, needed) };
}
// Larger vigils hold more cards, so each card must say less for the riddle to
// stay hard: cards that rule out more than this share of answers are left out.
const FLOOR = (size: number) => (size <= 8 ? 0.2 : size <= 12 ? 0.25 : 0.3);
export function makeRiddle(
  seed: string,
  size: number,
  solution?: Triple[],
): { solution: Triple[]; cards: Card[]; difficulty: GridDifficulty } {
  const random = rng(seed);
  const sol =
    solution ??
    (() => {
      const locs = shuffle([0, 1, 2, 3, 4], random),
        acts = shuffle([0, 1, 2, 3, 4], random);
      return locs.map((location, character) => ({
        character,
        location,
        activity: acts[character],
      }));
    })();
  const w = worldOf(sol);
  const pool = makePool(random, w);
  // Build many candidate card sets cheaply, then grade the most promising.
  const sets: { cards: Card[]; essential: number; patterns: number }[] = [];
  for (
    let attempt = 0;
    attempt < 40 || (!sets.length && attempt < 80);
    attempt++
  ) {
    const set = buildSet(random, pool, size, attempt < 40 ? FLOOR(size) : 0.04);
    if (!set || set.extra.length + set.essential.length < size) continue;
    const cards = [...set.essential, ...set.extra];
    sets.push({
      cards,
      essential: set.essential.length,
      patterns: new Set(cards.map((c) => c.pattern)).size,
    });
  }
  sets.sort(
    (a, b) => b.essential + 0.5 * b.patterns - (a.essential + 0.5 * a.patterns),
  );
  let best: {
    cards: Card[];
    difficulty: GridDifficulty;
    score: number;
  } | null = null;
  for (const set of sets.slice(0, 10)) {
    const d = difficulty(set.cards.map((c) => c.bits));
    // Hard: the one-clue-at-a-time solver needs many rounds or stalls, the
    // cards span many patterns, and most of them are needed.
    const score =
      (d.stalled ? 6 : d.rounds) +
      Math.min(set.patterns, 9) * 0.4 +
      set.essential * 0.3;
    if (!best || score > best.score)
      best = { cards: set.cards, difficulty: d, score };
    if (d.stalled || d.rounds >= 4) break;
  }
  if (!best) throw Error('Could not generate the Sphinx’s riddle.');
  return { solution: sol, cards: best.cards, difficulty: best.difficulty };
}
function forgedCard(r: R, solution: Triple[]): Card {
  // A forgery is true of a nearby wrong answer (two people trade places or
  // pastimes) and false of the real one, so it reads like any other clue.
  for (;;) {
    const w = worldOf(solution),
      [p, q] = people(r, 2);
    const loc = w.loc.slice(),
      act = w.act.slice();
    if (r() < 0.5) [loc[p], loc[q]] = [loc[q], loc[p]];
    else [act[p], act[q]] = [act[q], act[p]];
    const decoy = world(loc, act);
    const c = makeCard(
      r,
      decoy,
      pick(
        r,
        Object.keys(MAKERS).filter((k) => k !== 'direct'),
      ),
    );
    if (c && !compile(c.logic)(w)) return c;
  }
}
export function generateGrid(
  seed: string,
  members: string[],
  evil: string[],
  opensNight: number,
  forgedCount = 1,
): GridState {
  const random = rng(`${seed}:deal`);
  const { solution, cards } = makeRiddle(
    seed,
    members.length * CLUES_PER_PLAYER,
  );
  const texts = new Set<string>();
  const word = (c: Card) => {
    let text = render(random, c.logic, c.form);
    for (let i = 0; i < 20 && texts.has(text); i++)
      text = render(random, c.logic, c.form);
    texts.add(text);
    return text;
  };
  const clues: Clue[] = shuffle(cards, random).map((c, i) => {
    const k = i % CLUES_PER_PLAYER;
    return {
      id: `true-${i}`,
      logic: c.logic,
      pattern: c.pattern,
      text: word(c),
      holder: members[Math.floor(i / CLUES_PER_PLAYER)],
      // Two cards on the Rite's first night, then one more on each of the next two.
      revealNight: opensNight + Math.max(0, k - 1),
    };
  });
  for (const holder of evil)
    for (let i = 0; i < forgedCount; i++) {
      const c = forgedCard(random, solution);
      clues.push({
        id: `forged-${holder}-${i}`,
        holder,
        logic: c.logic,
        pattern: c.pattern,
        text: word(c),
        revealNight: opensNight,
        forged: true,
      });
    }
  return { type: 'grid', solution, clues, placements: {}, submissions: {} };
}
export function validTriples(value: unknown): value is Triple[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    ['character', 'location', 'activity'].every(
      (k) =>
        new Set(value.map((t) => t?.[k])).size === 5 &&
        value.every((t) => Number.isInteger(t?.[k]) && t[k] >= 0 && t[k] < 5),
    )
  );
}
export function validPlacements(value: unknown): value is Triple[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every(
      (t, i) =>
        t?.location === i &&
        ['character', 'activity'].every(
          (k) => Number.isInteger(t[k]) && t[k] >= -1 && t[k] < 5,
        ),
    ) &&
    ['character', 'activity'].every((k) => {
      const used = value.map((t) => t[k]).filter((x) => x >= 0);
      return new Set(used).size === used.length;
    })
  );
}
export const sameSolution = (a: Triple[], b: Triple[]) =>
  validTriples(a) &&
  a.every((t) =>
    b.some(
      (s) =>
        s.character === t.character &&
        s.location === t.location &&
        s.activity === t.activity,
    ),
  );
