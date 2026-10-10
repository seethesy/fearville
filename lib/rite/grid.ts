import { rng, shuffle } from './random.ts';
import type { Triple, Fact, Clue, GridState } from './types.ts';
export const CHARACTERS = [
  'Watchman',
  'Doctor',
  'Librarian',
  'Detective',
  'Mortician',
];
export const LOCATIONS = ['Library', 'Garden', 'House', 'Market', 'Graveyard'];
export const ACTIVITIES = [
  'Reading',
  'Eating',
  'Biking',
  'Shopping',
  'Sleeping',
];
const names = {
  character: CHARACTERS,
  location: LOCATIONS,
  activity: ACTIVITIES,
};
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
function permutations(items: number[]): number[][] {
  return items.length
    ? items.flatMap((x, i) =>
        permutations(items.filter((_, j) => i !== j)).map((p) => [x, ...p]),
      )
    : [[]];
}
const PERMS = permutations([0, 1, 2, 3, 4]);
export function solveGrid(clues: Pick<Clue, 'facts'>[], stopAfter = 2) {
  const out: Triple[][] = [];
  for (const locations of PERMS)
    for (const activities of PERMS) {
      const solution = locations.map((location, character) => ({
        character,
        location,
        activity: activities[character],
      }));
      if (clues.every((c) => satisfies(solution, c.facts))) {
        out.push(solution);
        if (out.length >= stopAfter) return out;
      }
    }
  return out;
}
export function generateGrid(
  seed: string,
  members: string[],
  evil: string[],
  opensNight: number,
  forgedCount = 1,
): GridState {
  const random = rng(seed),
    locs = shuffle([0, 1, 2, 3, 4], random),
    acts = shuffle([0, 1, 2, 3, 4], random);
  const solution = locs.map((location, character) => ({
    character,
    location,
    activity: acts[character],
  }));
  // Four dense cards identify four triples; bijectivity fixes the fifth. This
  // constructive core proves uniqueness even in a two-person, six-card vigil.
  const core = shuffle(solution, random)
    .slice(0, 4)
    .map((t) => [
      {
        a: 'character',
        x: t.character,
        b: 'location',
        ys: [t.location],
      } as Fact,
      {
        a: 'character',
        x: t.character,
        b: 'activity',
        ys: [t.activity],
      } as Fact,
    ]);
  // Larger vigils distribute the same information over less dense cards.
  const facts =
    members.length === 2 ? core : core.flatMap((c) => c.map((f) => [f]));
  const texts = new Set(facts.map(clueText));
  while (facts.length < members.length * 3) {
    const t = solution[Math.floor(random() * 5)];
    const b = random() < 0.5 ? 'location' : 'activity';
    const wrong = shuffle(
      [0, 1, 2, 3, 4].filter((x) => x !== t[b]),
      random,
    )[0];
    const f: Fact = {
      a:
        random() < 0.5
          ? 'character'
          : b === 'location'
            ? 'activity'
            : 'location',
      x: 0,
      b,
      ys: [wrong],
      not: true,
    };
    f.x = t[f.a];
    if (random() < 0.5) {
      f.ys = shuffle([t[b], wrong], random);
      f.not = false;
    }
    const text = clueText([f]);
    if (!texts.has(text)) {
      facts.push([f]);
      texts.add(text);
    }
  }
  const clues: Clue[] = shuffle(facts, random).map((f, i) => ({
    id: `true-${i}`,
    facts: f,
    text: clueText(f),
    holder: members[Math.floor(i / 3)],
    revealNight: opensNight + (i % 3),
  }));
  for (const holder of evil)
    for (let i = 0; i < forgedCount; i++) {
      const c = Math.floor(random() * 5),
        other = (c + 1 + i) % 5;
      // Swapping two locations gives a nearby alternative solution as cover.
      const f: Fact = {
        a: 'character',
        x: c,
        b: 'location',
        ys: [solution[other].location],
      };
      clues.push({
        id: `forged-${holder}-${i}`,
        holder,
        facts: [f],
        text: clueText([f]),
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
