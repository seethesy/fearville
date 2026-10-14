import type { Triple, Fact } from '../types.ts';
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
export const names = {
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
