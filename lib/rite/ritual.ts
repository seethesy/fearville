import { rng, shuffle } from './random.ts';
import type { Altar, ControlName, RitualState, Page } from './types.ts';
export const CONTROL_COUNTS: Record<ControlName, number> = {
  candles: 8,
  offerings: 6,
  chalice: 3,
  dial: 8,
  incense: 3,
};
export const SYMBOLS = [
  'Skull',
  'Skull and crossbones',
  'Waning crescent',
  'Waxing crescent',
  'Flying crow',
  'Perched crow',
  'Triangular hourglass',
  'Curvy hourglass',
];
export const OFFERINGS = [
  ['bone', 'feather', 'herb'],
  ['bone', 'herb', 'feather'],
  ['feather', 'bone', 'herb'],
  ['feather', 'herb', 'bone'],
  ['herb', 'bone', 'feather'],
  ['herb', 'feather', 'bone'],
];
// Symbols come in look-alike pairs (0/1, 2/3, 4/5, 6/7). An omen never shows
// both members of a pair, so it can't contain a skull and a skull and
// crossbones together: each omen takes one symbol from three different pairs.
export const SYMBOL_PAIRS = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
];
export function omenSets(): number[][] {
  const sets: number[][] = [];
  for (let skip = SYMBOL_PAIRS.length - 1; skip >= 0; skip--) {
    const pairs = SYMBOL_PAIRS.filter((_, i) => i !== skip);
    for (let mask = 0; mask < 8; mask++)
      sets.push(pairs.map((pair, i) => pair[(mask >> i) & 1]));
  }
  return sets;
}
export const validOmen = (symbols: number[]) =>
  SYMBOL_PAIRS.every(
    (pair) => pair.filter((x) => symbols.includes(x)).length < 2,
  );
export function controlLabel(control: ControlName, value: number) {
  if (control === 'candles')
    return ['Red', 'White', 'Purple']
      .map((c, i) => `${c} ${value & (1 << i) ? 'lit' : 'unlit'}`)
      .join(', ');
  if (control === 'offerings') return OFFERINGS[value].join(' · ');
  if (control === 'chalice') return ['Low', 'Half', 'Full'][value];
  if (control === 'incense') return ['Unlit', 'Smoldering', 'Blazing'][value];
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][value];
}
export function generateRitual(
  seed: string,
  members: string[],
  evil: string[],
): RitualState {
  if (members.length !== 3)
    throw Error('Divination needs exactly three players.');
  const random = rng(seed),
    sets = omenSets();
  const draw = shuffle(sets, random);
  const controls = Object.keys(CONTROL_COUNTS) as ControlName[];
  const book: Page[] = controls.map((control) => ({
    control,
    entries: Array.from({ length: CONTROL_COUNTS[control] }, (_, value) => ({
      value,
      symbols: draw.pop()!,
    })),
  }));
  const order = shuffle(members, random);
  const rituals = Object.fromEntries(
    order.map((performer, k) => {
      const chosen = shuffle(controls, random).slice(0, 3);
      const target = chosen.map((control) => ({
        control,
        value: Math.floor(random() * CONTROL_COUNTS[control]),
      }));
      const omensHolder = order[(k + 2) % 3];
      const symbols = (altar: Altar) =>
        shuffle(
          altar.map(
            (t) =>
              book.find((p) => p.control === t.control)!.entries[t.value]
                .symbols,
          ),
          random,
        );
      return [
        performer,
        {
          performer,
          omensHolder,
          keeper: order[(k + 1) % 3],
          controls: chosen,
          target,
          altar: chosen.map((control) => ({ control, value: 0 })),
          omens: symbols(target),
          attempts: [],
          ...(evil.includes(omensHolder)
            ? {
                decoys: symbols(
                  target.map((t) => ({
                    control: t.control,
                    value: (t.value + 1) % CONTROL_COUNTS[t.control],
                  })),
                ),
              }
            : {}),
        },
      ];
    }),
  );
  return { type: 'ritual', book, rituals };
}
export function validAltar(
  value: unknown,
  controls: ControlName[],
): value is Altar {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    new Set(value.map((v) => v?.control)).size === 3 &&
    value.every(
      (v) =>
        controls.includes(v?.control) &&
        Number.isInteger(v.value) &&
        v.value >= 0 &&
        v.value < CONTROL_COUNTS[v.control as ControlName],
    )
  );
}
