import { rng, shuffle } from '../random.ts';
import type { Triple, Clue, GridState } from '../types.ts';
import { CLUES_PER_PLAYER } from './vocabulary.ts';
import {
  type World,
  WORDS,
  and,
  popcount,
  worldOf,
  world,
  compile,
  bits,
} from './solver.ts';
import { difficulty } from './difficulty.ts';
import { type R, pick, render } from './prose.ts';
import { type Card, makeCard, people, MAKERS } from './makers.ts';
// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export type GridDifficulty = { rounds: number; stalled: boolean };
export type GridGenerationOptions = {
  difficulty?: 'easy' | 'standard' | 'hard';
  candidateCount?: number;
  targetRounds?: number;
};
const EASY_MAKERS = [
  'direct',
  'direct',
  'negative',
  'eitherOr',
  'neitherNor',
  'relational',
  'relational',
  'street',
  'exclusivePair',
  'setMembership',
];
const STANDARD_MAKERS = [
  ...EASY_MAKERS,
  'oneOfThree',
  'threeWay',
  'crossCategory',
  'compound',
  'exclusiveOr',
];
export function makePool(
  r: R,
  w: World,
  level?: GridGenerationOptions['difficulty'],
) {
  const pool = new Map<string, Card>();
  for (let i = 0; i < 500 && pool.size < 110; i++) {
    const c = makeCard(
      r,
      w,
      level === 'easy'
        ? pick(r, EASY_MAKERS)
        : level === 'standard'
          ? pick(r, STANDARD_MAKERS)
          : undefined,
    );
    if (c && !pool.has(c.key)) pool.set(c.key, c);
  }
  return [...pool.values()];
}
export const DENSE = new Set([
  'exclusive-pairing',
  'set-membership',
  'cross-category',
]);
export function buildSet(
  r: R,
  pool: Card[],
  size: number,
  floor: number,
  directLimit = 1,
) {
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
    // Easier profiles admit more direct anchors; dense cards stay limited.
    if (
      c.pattern === 'direct' &&
      chosen.filter((x) => x.pattern === 'direct').length >= directLimit
    )
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
export const FLOOR = (size: number) =>
  size <= 8 ? 0.2 : size <= 12 ? 0.25 : 0.3;
export function makeRiddle(
  seed: string,
  size: number,
  solution?: Triple[],
  options?: GridGenerationOptions,
): { solution: Triple[]; cards: Card[]; difficulty: GridDifficulty } {
  if (!Number.isInteger(size) || size < 8 || size > 16)
    throw Error('A Sphinx riddle needs between 8 and 16 clue cards.');
  if (solution && !validTriples(solution))
    throw Error('The Sphinx solution must contain five distinct triples.');
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
  const level = options?.difficulty ?? 'hard';
  const pool = makePool(random, w, level);
  const candidates = Number.isFinite(options?.candidateCount)
    ? Math.max(8, Math.min(64, Math.round(options!.candidateCount!)))
    : 40;
  const targetRounds = Number.isFinite(options?.targetRounds)
    ? Math.max(1, Math.min(8, Math.round(options!.targetRounds!)))
    : level === 'easy'
      ? 1
      : level === 'standard'
        ? 2
        : 4;
  // Build many candidate card sets cheaply, then grade the most promising.
  const sets: { cards: Card[]; essential: number; patterns: number }[] = [];
  for (
    let attempt = 0;
    attempt < candidates || (!sets.length && attempt < candidates * 2);
    attempt++
  ) {
    const floor =
      level === 'easy' ? 0.08 : level === 'standard' ? 0.15 : FLOOR(size);
    const set = buildSet(
      random,
      pool,
      size,
      attempt < candidates ? floor : 0.04,
      level === 'easy' ? 4 : level === 'standard' ? 2 : 1,
    );
    if (!set || set.extra.length + set.essential.length < size) continue;
    const cards = [...set.essential, ...set.extra];
    sets.push({
      cards,
      essential: set.essential.length,
      patterns: new Set(cards.map((c) => c.pattern)).size,
    });
  }
  sets.sort((a, b) =>
    level === 'hard'
      ? b.essential + 0.5 * b.patterns - (a.essential + 0.5 * a.patterns)
      : a.essential - b.essential || b.patterns - a.patterns,
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
    const distance = d.stalled
      ? Math.abs(6 - targetRounds) +
        (level === 'hard' && targetRounds >= 4 ? 0 : 12)
      : Math.abs(d.rounds - targetRounds);
    const score = options
      ? -distance * 4 +
        Math.min(set.patterns, 9) * 0.4 +
        set.essential * (level === 'hard' ? 0.3 : -0.1)
      : (d.stalled ? 6 : d.rounds) +
        Math.min(set.patterns, 9) * 0.4 +
        set.essential * 0.3;
    if (!best || score > best.score)
      best = { cards: set.cards, difficulty: d, score };
    if (!options && (d.stalled || d.rounds >= 4)) break;
  }
  if (!best) throw Error('Could not generate the Sphinx’s riddle.');
  return { solution: sol, cards: best.cards, difficulty: best.difficulty };
}
export function forgedCard(r: R, solution: Triple[]): Card {
  // A forgery is true of a nearby wrong answer (two people trade places or
  // pastimes) and false of the real one, so it reads like any other clue.
  for (let attempt = 0; attempt < 256; attempt++) {
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
  // A bounded fallback is a direct statement about a swapped location.
  const logic = {
    t: 'is' as const,
    a: { cat: 'character' as const, id: 0 },
    b: { cat: 'location' as const, id: worldOf(solution).loc[1] },
  };
  const values = bits(compile(logic));
  return {
    logic,
    pattern: 'direct',
    key: JSON.stringify(logic),
    bits: values,
    count: popcount(values),
  };
}
export function generateGrid(
  seed: string,
  members: string[],
  evil: string[],
  opensNight: number,
  forgedCount = 1,
  options?: GridGenerationOptions,
): GridState {
  const random = rng(`${seed}:deal`);
  const { solution, cards } = makeRiddle(
    seed,
    members.length * CLUES_PER_PLAYER,
    undefined,
    options,
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
