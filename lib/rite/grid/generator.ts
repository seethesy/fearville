import { GENERATOR_STYLE } from '../generator-config.ts';
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
} from './solver.ts';
import { difficulty } from './difficulty.ts';
import { type R, pick, render } from './prose.ts';
import { type Card, makeCard, people, MAKERS } from './makers.ts';
// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------
export type GridDifficulty = { rounds: number; stalled: boolean };
export function makePool(r: R, w: World) {
  const pool = new Map<string, Card>();
  for (
    let i = 0;
    i < GENERATOR_STYLE.grid.poolAttempts &&
    pool.size < GENERATOR_STYLE.grid.poolSize;
    i++
  ) {
    const c = makeCard(r, w);
    if (c && !pool.has(c.key)) pool.set(c.key, c);
  }
  return [...pool.values()];
}
export const DENSE = new Set([
  'exclusive-pairing',
  'set-membership',
  'cross-category',
]);
export function buildSet(r: R, pool: Card[], size: number, floor: number) {
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
export const FLOOR = (size: number) =>
  size <= 8 ? 0.2 : size <= 12 ? 0.25 : 0.3;
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
    attempt < GENERATOR_STYLE.grid.setAttempts ||
    (!sets.length && attempt < GENERATOR_STYLE.grid.fallbackAttempts);
    attempt++
  ) {
    const set = buildSet(
      random,
      pool,
      size,
      attempt < GENERATOR_STYLE.grid.setAttempts ? FLOOR(size) : 0.04,
    );
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
  for (const set of sets.slice(0, GENERATOR_STYLE.grid.gradedSets)) {
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
export function forgedCard(r: R, solution: Triple[]): Card {
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
    for (
      let i = 0;
      i < GENERATOR_STYLE.grid.wordingAttempts && texts.has(text);
      i++
    )
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
