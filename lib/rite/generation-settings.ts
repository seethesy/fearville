import type { BoardGenerationOptions } from './board.ts';
import type { LabGenerationOptions } from './lab.ts';
import type { Pattern } from './types.ts';

export const DIFFICULTIES = ['easy', 'standard', 'hard'] as const;
export type PuzzleDifficulty = (typeof DIFFICULTIES)[number];
export type GenerationProfile = {
  board: { minMoves: number; maxMoves: number; maxRemovedBlocks: number };
  lab: { minMoves: number; maxMoves: number; colors: number };
  grid: { candidateCount: number; targetRounds: number };
  ritual: { linkedRules: number; ruleDepth: number };
};
export type GenerationSettings = {
  version: 1;
  nightDifficulty: PuzzleDifficulty;
  profiles: Record<PuzzleDifficulty, GenerationProfile>;
};
export type GenerationSnapshot = {
  revision: number;
  settings: GenerationSettings;
};
export const DEFAULT_GENERATION: GenerationSettings = {
  version: 1,
  nightDifficulty: 'hard',
  profiles: {
    easy: {
      board: { minMoves: 5, maxMoves: 9, maxRemovedBlocks: 3 },
      lab: { minMoves: 5, maxMoves: 9, colors: 4 },
      grid: { candidateCount: 16, targetRounds: 1 },
      ritual: { linkedRules: 0, ruleDepth: 0 },
    },
    standard: {
      board: { minMoves: 14, maxMoves: 20, maxRemovedBlocks: 1 },
      lab: { minMoves: 14, maxMoves: 20, colors: 7 },
      grid: { candidateCount: 24, targetRounds: 2 },
      ritual: { linkedRules: 1, ruleDepth: 2 },
    },
    hard: {
      board: { minMoves: 28, maxMoves: 32, maxRemovedBlocks: 0 },
      lab: { minMoves: 28, maxMoves: 32, colors: 10 },
      grid: { candidateCount: 40, targetRounds: 4 },
      ritual: { linkedRules: 2, ruleDepth: 3 },
    },
  },
};
export const TUNING_FIELDS: Record<
  Pattern,
  { key: string; label: string; min: number; max: number; step?: number }[]
> = {
  board: [
    { key: 'minMoves', label: 'Minimum optimal slides', min: 1, max: 32 },
    { key: 'maxMoves', label: 'Maximum optimal slides', min: 1, max: 32 },
    {
      key: 'maxRemovedBlocks',
      label: 'Layout simplification budget',
      min: 0,
      max: 3,
    },
  ],
  lab: [
    { key: 'minMoves', label: 'Minimum optimal pours', min: 1, max: 32 },
    { key: 'maxMoves', label: 'Maximum optimal pours', min: 1, max: 32 },
    {
      key: 'colors',
      label: 'Liquid colors (4, 7, or 10)',
      min: 4,
      max: 10,
      step: 3,
    },
  ],
  grid: [
    { key: 'candidateCount', label: 'Candidate clue sets', min: 8, max: 64 },
    { key: 'targetRounds', label: 'Target deduction rounds', min: 1, max: 8 },
  ],
  ritual: [
    { key: 'linkedRules', label: 'Linked controls', min: 0, max: 2 },
    { key: 'ruleDepth', label: 'Ordered rule steps', min: 0, max: 6 },
  ],
};
export function puzzleDifficulty(value: unknown): PuzzleDifficulty {
  if (!DIFFICULTIES.includes(value as PuzzleDifficulty))
    throw Error('Choose easy, standard, or hard difficulty.');
  return value as PuzzleDifficulty;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Choose valid generation settings.');
  return value as Record<string, unknown>;
}
export function generationSettings(value: unknown): GenerationSettings {
  const raw = record(value);
  if (raw.version !== 1)
    throw Error('Unsupported generation settings version.');
  const profiles = record(raw.profiles);
  const result = structuredClone(DEFAULT_GENERATION);
  result.nightDifficulty = puzzleDifficulty(raw.nightDifficulty);
  for (const level of DIFFICULTIES) {
    const profile = record(profiles[level]);
    for (const pattern of Object.keys(TUNING_FIELDS) as Pattern[]) {
      const values = record(profile[pattern]);
      for (const field of TUNING_FIELDS[pattern]) {
        const n = values[field.key];
        if (
          typeof n !== 'number' ||
          !Number.isInteger(n) ||
          n < field.min ||
          n > field.max ||
          (n - field.min) % (field.step ?? 1)
        )
          throw Error(
            `${level}: ${field.label} must be between ${field.min} and ${field.max}${field.step ? ` in steps of ${field.step}` : ''}.`,
          );
        (result.profiles[level][pattern] as Record<string, number>)[field.key] =
          n;
      }
    }
    for (const kind of ['board', 'lab'] as const)
      if (
        result.profiles[level][kind].minMoves >
        result.profiles[level][kind].maxMoves
      )
        throw Error(
          `${level}: minimum ${kind} moves must not exceed maximum moves.`,
        );
    const lab = result.profiles[level].lab;
    const supportedPar = lab.colors === 4 ? 9 : lab.colors === 7 ? 20 : 32;
    if (lab.maxMoves > supportedPar)
      throw Error(
        `${level}: ${lab.colors} liquid colors support at most ${supportedPar} optimal pours. Increase the colors or lower the move range.`,
      );
    const ritual = result.profiles[level].ritual;
    if (ritual.linkedRules > Math.max(0, ritual.ruleDepth - 1))
      throw Error(
        `${level}: linked controls need an earlier rule step; increase ordered rule steps.`,
      );
  }
  for (let i = 1; i < DIFFICULTIES.length; i++) {
    const previous = result.profiles[DIFFICULTIES[i - 1]],
      next = result.profiles[DIFFICULTIES[i]];
    for (const kind of ['board', 'lab'] as const)
      if (next[kind].minMoves <= previous[kind].maxMoves)
        throw Error(
          'Movement difficulty ranges must increase without overlapping.',
        );
    if (
      next.grid.targetRounds < previous.grid.targetRounds ||
      next.ritual.linkedRules < previous.ritual.linkedRules ||
      next.ritual.ruleDepth < previous.ritual.ruleDepth ||
      next.lab.colors < previous.lab.colors
    )
      throw Error(
        'Reasoning complexity and liquid colors must not decrease at higher difficulties.',
      );
  }
  return result;
}
export function movementOptions(
  profile: GenerationProfile,
  kind: 'board',
): BoardGenerationOptions;
export function movementOptions(
  profile: GenerationProfile,
  kind: 'lab',
): LabGenerationOptions;
export function movementOptions(
  profile: GenerationProfile,
  kind: 'board' | 'lab',
): BoardGenerationOptions | LabGenerationOptions {
  return { ...profile[kind] };
}
