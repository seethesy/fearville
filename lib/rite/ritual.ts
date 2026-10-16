import { rng, shuffle } from './random.ts';
import type {
  Altar,
  ControlName,
  RitualState,
  RitualRule,
  Page,
} from './types.ts';
export type RitualGenerationOptions = {
  difficulty?: 'easy' | 'standard' | 'hard';
  linkedRules?: number;
  ruleDepth?: number;
};
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
const wrap = (value: number, count: number) =>
  ((value % count) + count) % count;
/** Rules act on the current settings in order; every operation is reversible. */
export function applyRitualRules(base: Altar, rules: RitualRule[] = []): Altar {
  const altar = base.map((entry) => ({ ...entry }));
  for (const rule of rules) {
    const entry = altar.find((item) => item.control === rule.control);
    if (!entry) throw Error('A ritual rule refers to a missing control.');
    const count = CONTROL_COUNTS[entry.control];
    if (rule.kind === 'mirror') entry.value = count - 1 - entry.value;
    else if (rule.kind === 'shift')
      entry.value = wrap(entry.value + (rule.amount ?? 0), count);
    else {
      const source = altar.find((item) => item.control === rule.source);
      if (!source || source === entry)
        throw Error('A ritual link needs a different control.');
      entry.value = wrap(entry.value + source.value + 1, count);
    }
  }
  return altar;
}
export function ritualRuleText(rule: RitualRule) {
  if (rule.kind === 'mirror')
    return `Reverse the ${rule.control} setting number: first becomes last, second becomes second-last, and so on.`;
  if (rule.kind === 'link')
    return `Advance ${rule.control} by the current ${rule.source} setting number (starting at 1), wrapping from the last setting to the first.`;
  const amount = rule.amount ?? 0;
  return `Move ${rule.control} ${Math.abs(amount)} setting${Math.abs(amount) === 1 ? '' : 's'} ${amount < 0 ? 'backward' : 'forward'}, wrapping around the ends of the list.`;
}
const omenKey = (symbols: number[]) =>
  [...symbols].sort((a, b) => a - b).join(',');
/** A book has globally unique symbol sets, so each omen has exactly one reading. */
export function decodeRitual(
  book: Page[],
  omens: number[][],
  rules: RitualRule[] = [],
): Altar | null {
  const base: Altar = [];
  for (const symbols of omens) {
    const key = omenKey(symbols);
    const matches = book.flatMap((page) =>
      page.entries
        .filter((entry) => omenKey(entry.symbols) === key)
        .map((entry) => ({ control: page.control, value: entry.value })),
    );
    if (
      matches.length !== 1 ||
      base.some((entry) => entry.control === matches[0].control)
    )
      return null;
    base.push(matches[0]);
  }
  if (base.length !== 3) return null;
  return applyRitualRules(base, rules);
}
function bounded(value: number | undefined, fallback: number, max: number) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.round(value!)))
    : fallback;
}
function makeRules(
  controls: ControlName[],
  random: () => number,
  options?: RitualGenerationOptions,
) {
  if (!options) return [];
  const level = options.difficulty ?? 'hard';
  const depth = bounded(
    options.ruleDepth,
    level === 'easy' ? 0 : level === 'standard' ? 1 : 3,
    6,
  );
  const links = bounded(options.linkedRules, level === 'hard' ? 2 : 0, 2);
  const rules: RitualRule[] = [];
  // Dependencies point forward through this shuffled order; the last two
  // controls can depend on the already-transformed previous setting.
  for (let index = 0; index < depth; index++) {
    const targetIndex = Math.min(index, controls.length - 1);
    const control = controls[targetIndex];
    if (index > 0 && index <= links) {
      rules.push({ control, kind: 'link', source: controls[targetIndex - 1] });
    } else if (random() < 0.35) {
      rules.push({ control, kind: 'mirror' });
    } else {
      const amount = 1 + Math.floor(random() * (CONTROL_COUNTS[control] - 1));
      rules.push({
        control,
        kind: 'shift',
        amount: random() < 0.5 ? amount : -amount,
      });
    }
  }
  return rules;
}
export function generateRitual(
  seed: string,
  members: string[],
  evil: string[],
  options?: RitualGenerationOptions,
): RitualState {
  if (members.length !== 3 || new Set(members).size !== 3)
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
      const base = chosen.map((control) => ({
        control,
        value: Math.floor(random() * CONTROL_COUNTS[control]),
      }));
      const rules = makeRules(chosen, random, options);
      let target = applyRitualRules(base, rules);
      // A new practice puzzle must require an action from the blank altar.
      if (options && target.every((entry) => entry.value === 0)) {
        base[base.length - 1].value =
          (base[base.length - 1].value + 1) %
          CONTROL_COUNTS[base[base.length - 1].control];
        target = applyRitualRules(base, rules);
      }
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
          omens: symbols(base),
          ...(rules.length ? { rules } : {}),
          attempts: [],
          ...(evil.includes(omensHolder)
            ? {
                decoys: symbols(
                  base.map((t) => ({
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
