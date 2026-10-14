import { shuffle } from '../random.ts';
import type { Ent, Logic } from '../types.ts';
import { LOCATIONS, CHARACTERS } from './vocabulary.ts';
// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------
export type R = () => number;
export type Pair = { t: 'is' | 'not'; a: Ent; b: Ent };
export const pick = <T>(r: R, xs: readonly T[]) =>
  xs[Math.floor(r() * xs.length)];
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const IN = [
  'in the Library',
  'in the Garden',
  'at the House',
  'at the Market',
  'in the Graveyard',
];
export const PLACE = LOCATIONS.map((l) => `the ${l}`);
export const GERUND = ['reading', 'eating', 'biking', 'shopping', 'sleeping'];
export const ACT_NOUN = [
  ['the reader', 'whoever was reading', 'the person who was reading'],
  ['whoever was eating', 'the person who was eating', 'the one eating'],
  ['the cyclist', 'whoever was biking', 'the person out biking'],
  ['the shopper', 'whoever was shopping', 'the person out shopping'],
  ['the sleeper', 'whoever was sleeping', 'the person who was asleep'],
];
export const ACT_YES = [
  ['was reading', 'spent the night reading', 'had their nose in a book'],
  ['was eating', 'spent the night eating', 'was having a meal'],
  ['was biking', 'spent the night biking', 'was out on a bike'],
  ['was shopping', 'spent the night shopping', 'was out shopping'],
  ['was sleeping', 'spent the night asleep', 'was fast asleep'],
];
export const ACT_NO = [
  ['wasn’t reading', 'wasn’t the one reading', 'never opened a book'],
  ['wasn’t eating', 'wasn’t the one eating', 'didn’t eat a thing'],
  ['wasn’t biking', 'wasn’t the cyclist', 'never got on a bike'],
  ['wasn’t shopping', 'wasn’t the shopper', 'did no shopping'],
  ['wasn’t sleeping', 'wasn’t the sleeper', 'didn’t sleep a wink'],
];
export function noun(r: R, e: Ent) {
  if (e.cat === 'character') return `the ${CHARACTERS[e.id]}`;
  if (e.cat === 'location')
    return pick(r, [`whoever was ${IN[e.id]}`, `the person ${IN[e.id]}`]);
  return pick(r, ACT_NOUN[e.id]);
}
// Object of "west of", "next door to": places are named directly.
export const target = (r: R, e: Ent) =>
  e.cat === 'location' ? PLACE[e.id] : noun(r, e);
export function pred(r: R, e: Ent, neg = false) {
  if (e.cat === 'character')
    return `${neg ? 'wasn’t' : 'was'} the ${CHARACTERS[e.id]}`;
  if (e.cat === 'location')
    return neg
      ? pick(r, [`wasn’t ${IN[e.id]}`, `stayed away from ${PLACE[e.id]}`])
      : pick(r, [`was ${IN[e.id]}`, `spent the night ${IN[e.id]}`]);
  return pick(r, (neg ? ACT_NO : ACT_YES)[e.id]);
}
// The bare complement used in lists: "the Doctor", "in the Garden", "reading".
export function bare(e: Ent) {
  if (e.cat === 'character') return `the ${CHARACTERS[e.id]}`;
  return e.cat === 'location' ? IN[e.id] : GERUND[e.id];
}
export const list = (xs: string[], joiner = 'and') =>
  xs.length < 3
    ? xs.join(` ${joiner} `)
    : `${xs.slice(0, -1).join(', ')} ${joiner} ${xs.at(-1)}`;
// Characters read best as subjects, so put one first when there is one.
export function ordered(a: Ent, b: Ent): [Ent, Ent] {
  return b.cat === 'character' && a.cat !== 'character' ? [b, a] : [a, b];
}
export function simple(r: R, l: Logic): string {
  if (l.t !== 'is' && l.t !== 'not') throw Error('not a simple clue');
  const [a, b] = ordered(l.a, l.b);
  return `${noun(r, a)} ${pred(r, b, l.t === 'not')}`;
}
export const STREET: Record<string, string[]> = {
  '0,4': ['at one end of the street', 'at one of the two ends of the street'],
  '2': ['in the very middle of the street', 'at the centre of the street'],
  '0,1': ['at one of the two westernmost places'],
  '3,4': ['at one of the two easternmost places'],
  '1,2,3': ['somewhere away from both ends of the street'],
  '0,1,2': ['in one of the three westernmost places'],
  '2,3,4': ['in one of the three easternmost places'],
};
export function render(r: R, l: Logic, form?: string): string {
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
