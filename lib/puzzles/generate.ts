import {
  directions,
  getDifficultyConfig,
  settings,
  type PatternFamily,
  type PuzzleKind,
} from './config.ts';
import { createRandom, integer, pick, shuffle, type Random } from './random.ts';
import {
  distinctGroups,
  getCategory,
  relatedGroups,
  wordPool,
} from './words.ts';
export type Content =
  | { kind: 'tiles'; grid: number; highlighted: number[]; previewMs: number }
  | { kind: 'words'; sequence: string[] }
  | {
      kind: 'odd';
      options: string[];
      answer: string;
      category: string;
      otherCategory: string;
    }
  | { kind: 'rhythm'; inputs: string[]; sequence: string[]; beatMs: number }
  | {
      kind: 'sorting';
      categories: string[];
      items: { word: string; category: string }[];
    }
  | {
      kind: 'pattern';
      family: PatternFamily;
      sequence: string[];
      options: string[];
      answer: string;
      rule: string;
      terms: string[];
    };
type Config = ReturnType<typeof getDifficultyConfig>;

function pattern(
  c: Config,
  rng: Random,
): Extract<Content, { kind: 'pattern' }> {
  const family = pick(c.families, rng);
  const length = c.level >= 9 ? 8 : 5;
  const start = integer(rng, 1, 5),
    step = integer(rng, 1, c.level <= 2 ? 2 : 5);
  let terms: string[] = [],
    rule = '';
  if (['repeat', 'groups', 'mixed'].includes(family)) {
    const symbols = shuffle(['●', '▲', '■', '◆', '★', '○'], rng);
    const group =
      family === 'repeat'
        ? symbols.slice(0, 2)
        : family === 'mixed'
          ? [symbols[0], symbols[1], symbols[0], symbols[2]]
          : c.level >= 5
            ? [symbols[0], symbols[0], symbols[1], symbols[2]]
            : [symbols[0], symbols[0], symbols[1]];
    terms = Array.from(
      { length: group.length * 2 + 2 },
      (_, i) => group[i % group.length],
    );
    rule = `Repeat the group ${group.join(' ')}.`;
  } else if (family === 'alphabet') {
    const skip = integer(rng, 1, 3),
      first = integer(rng, 0, 25 - skip * length);
    terms = Array.from({ length: length + 1 }, (_, i) =>
      String.fromCharCode(65 + first + i * skip),
    );
    rule = `Move forward ${skip} letters each time.`;
  } else {
    const multiplier = integer(rng, 2, 3);
    let n = family === 'decrease' ? start + step * length : start;
    terms = [String(n)];
    for (let i = 1; i <= length; i++) {
      if (family === 'increase') n += step;
      if (family === 'decrease') n -= step;
      if (family === 'multiply') n *= multiplier;
      if (family === 'differences') n += step + i - 1;
      if (family === 'alternate') n = i % 2 ? n * 2 : n - 1;
      if (family === 'interleave')
        n =
          i % 2
            ? start + 10 + Math.floor(i / 2) * step
            : start + (i / 2) * step;
      terms.push(String(n));
    }
    rule =
      family === 'increase'
        ? `Add ${step} each time.`
        : family === 'decrease'
          ? `Subtract ${step} each time.`
          : family === 'multiply'
            ? `Multiply by ${multiplier} each time.`
            : family === 'differences'
              ? `Add ${step}, then ${step + 1}, increasing the difference by 1.`
              : family === 'alternate'
                ? 'Alternate ×2 and −1.'
                : `Two interleaved sequences, each adding ${step}.`;
  }
  const answer = terms[terms.length - 1];
  const sequence = terms.slice(0, -1);
  let candidates: string[];
  if (/^\d+$/.test(answer)) {
    const n = Number(answer),
      previous = Number(sequence.at(-1));
    candidates = [
      previous + step,
      previous * 2,
      previous - 1,
      n - 1,
      n + 1,
      n - step,
      n + step,
      n + 2,
    ].map(String);
  } else if (family === 'alphabet')
    candidates = Array.from({ length: 26 }, (_, i) =>
      String.fromCharCode(65 + i),
    );
  else candidates = ['●', '▲', '■', '◆', '★', '○'];
  const wrong = [...new Set(candidates)]
    .filter((x) => x !== answer)
    .slice(0, 3);
  return {
    kind: 'pattern',
    family,
    sequence,
    answer,
    rule,
    terms,
    options: shuffle([answer, ...wrong], rng),
  };
}

function generate(kind: PuzzleKind, c: Config, rng: Random): Content {
  if (kind === 'tiles')
    return {
      kind,
      grid: c.grid,
      previewMs: c.previewMs,
      highlighted: shuffle(
        Array.from({ length: c.grid * c.grid }, (_, i) => i),
        rng,
      ).slice(0, integer(rng, c.minTiles, c.maxTiles)),
    };
  if (kind === 'rhythm') {
    const inputs = directions.slice(0, c.inputCount),
      sequence: string[] = [];
    for (let i = 0, n = integer(rng, c.minLength, c.maxLength); i < n; i++) {
      const last = sequence.at(-1);
      const allowed =
        sequence.length >= settings.rhythmMaxRun &&
        sequence.slice(-settings.rhythmMaxRun).every((x) => x === last)
          ? inputs.filter((x) => x !== last)
          : inputs;
      sequence.push(pick(allowed, rng));
    }
    return { kind, inputs, sequence, beatMs: c.beatMs };
  }
  if (kind === 'words') {
    const pool = shuffle(wordPool, rng),
      sequence: string[] = [],
      seen: string[] = [];
    const targetNew = Math.round(settings.wordRounds * settings.wordNewRatio);
    let streak = 0,
      lastNew = false;
    for (let i = 0; i < settings.wordRounds; i++) {
      const repeats = seen.filter(
        (w) => settings.allowImmediateRepeat || w !== sequence.at(-1),
      );
      const remainingNew = targetNew - seen.length;
      let isNew =
        !repeats.length ||
        (remainingNew > 0 && rng() < remainingNew / (settings.wordRounds - i));
      if (streak >= settings.maxWordStreak) isNew = !lastNew;
      if (!repeats.length || remainingNew === settings.wordRounds - i)
        isNew = true;
      if (remainingNew === 0) isNew = false;
      const word = isNew ? pool[seen.length] : pick(repeats, rng);
      if (isNew) seen.push(word);
      sequence.push(word);
      streak = isNew === lastNew ? streak + 1 : 1;
      lastNew = isNew;
    }
    return { kind, sequence };
  }
  if (kind === 'odd') {
    const groups =
      c.semanticDifficulty === 3
        ? relatedGroups
        : c.semanticDifficulty === 2
          ? [...distinctGroups, ...relatedGroups]
          : distinctGroups;
    const [main, other] = shuffle(pick(groups, rng), rng);
    const answer = pick(getCategory(other).words, rng);
    return {
      kind,
      category: main,
      otherCategory: other,
      answer,
      options: shuffle(
        [
          ...shuffle(getCategory(main).words, rng).slice(0, c.choices - 1),
          answer,
        ],
        rng,
      ),
    };
  }
  if (kind === 'sorting') {
    const groups =
      c.level <= 4
        ? distinctGroups
        : relatedGroups.filter((g) => g.length >= c.categoryCount);
    const active = shuffle(pick(groups, rng), rng).slice(0, c.categoryCount);
    const items = active.flatMap((id, i) =>
      shuffle(getCategory(id).words, rng)
        .slice(
          0,
          Math.floor(c.itemCount / active.length) +
            (i < c.itemCount % active.length ? 1 : 0),
        )
        .map((word) => ({ word, category: id })),
    );
    return { kind, categories: active, items: shuffle(items, rng) };
  }
  return pattern(c, rng);
}
const unique = (xs: unknown[]) => new Set(xs).size === xs.length;
export function validatePuzzle(p: Content, level: number): boolean {
  const c = getDifficultyConfig(p.kind, level);
  switch (p.kind) {
    case 'tiles':
      return (
        p.grid === c.grid &&
        p.previewMs === c.previewMs &&
        p.highlighted.length >= c.minTiles &&
        p.highlighted.length <= c.maxTiles &&
        unique(p.highlighted) &&
        p.highlighted.every(
          (n) => Number.isInteger(n) && n >= 0 && n < p.grid * p.grid,
        )
      );
    case 'words': {
      if (
        p.sequence.length !== settings.wordRounds ||
        !p.sequence.every((w) => wordPool.includes(w))
      )
        return false;
      const seen = new Set<string>();
      let previous = false,
        streak = 0;
      for (let i = 0; i < p.sequence.length; i++) {
        const fresh = !seen.has(p.sequence[i]);
        streak = fresh === previous ? streak + 1 : 1;
        previous = fresh;
        if (
          streak > settings.maxWordStreak ||
          (!settings.allowImmediateRepeat &&
            p.sequence[i] === p.sequence[i - 1])
        )
          return false;
        seen.add(p.sequence[i]);
      }
      return (
        seen.size / p.sequence.length >= 0.55 &&
        seen.size / p.sequence.length <= 0.7
      );
    }
    case 'odd':
      return (
        p.options.length === c.choices &&
        unique(p.options) &&
        getCategory(p.otherCategory).words.includes(p.answer) &&
        p.options.filter((w) => !getCategory(p.category).words.includes(w))
          .length === 1 &&
        p.options.includes(p.answer) &&
        !getCategory(p.category).words.includes(p.answer)
      );
    case 'rhythm':
      return (
        p.sequence.length >= c.minLength &&
        p.sequence.length <= c.maxLength &&
        p.inputs.length === c.inputCount &&
        p.beatMs === c.beatMs &&
        unique(p.inputs) &&
        p.inputs.every((x) => directions.slice(0, c.inputCount).includes(x)) &&
        p.sequence.every(
          (x, i) =>
            p.inputs.includes(x) &&
            (i < settings.rhythmMaxRun ||
              !p.sequence
                .slice(i - settings.rhythmMaxRun, i)
                .every((y) => y === x)),
        )
      );
    case 'sorting': {
      const counts = p.categories.map(
        (id) => p.items.filter((i) => i.category === id).length,
      );
      return (
        p.categories.length === c.categoryCount &&
        unique(p.categories) &&
        p.items.length === c.itemCount &&
        unique(p.items.map((i) => i.word)) &&
        Math.max(...counts) - Math.min(...counts) <= 1 &&
        p.items.every(
          (i) =>
            p.categories.includes(i.category) &&
            getCategory(i.category).words.includes(i.word) &&
            p.categories.filter((id) => getCategory(id).words.includes(i.word))
              .length === 1,
        )
      );
    }
    case 'pattern':
      return (
        c.families.includes(p.family) &&
        p.options.length === 4 &&
        unique(p.options) &&
        p.options.filter((x) => x === p.answer).length === 1 &&
        p.terms.at(-1) === p.answer &&
        JSON.stringify(p.terms.slice(0, -1)) === JSON.stringify(p.sequence) &&
        p.sequence.length >= 5
      );
  }
}
export function generatePuzzle(
  kind: PuzzleKind,
  level: number,
  seed: string | number,
): Content {
  const config = getDifficultyConfig(kind, level),
    rng = createRandom(seed);
  for (let attempt = 0; attempt < settings.generationAttempts; attempt++) {
    const result = generate(kind, config, rng);
    if (validatePuzzle(result, level)) return result;
  }
  throw Error(
    `Unable to generate a valid ${kind} puzzle at level ${level} after ${settings.generationAttempts} attempts (seed ${seed}).`,
  );
}
