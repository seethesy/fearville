// FEAR-174: browser-side helpers for feedback prompts. Pure logic takes its
// storage, clock and randomness as arguments so it can be unit tested.
import type { Answer, FormContext } from './forms.ts';

export type PromptContext = 'puzzle' | 'script' | 'storyteller';

// Rating prompts are a random sample, with a per-context cooldown so a
// player who is asked once is not asked again soon after.
export const PROMPT_RULES: Record<
  PromptContext,
  { rate: number; cooldownMs: number }
> = {
  puzzle: { rate: 1 / 3, cooldownMs: 6 * 3600_000 },
  script: { rate: 1 / 2, cooldownMs: 24 * 3600_000 },
  storyteller: { rate: 1 / 2, cooldownMs: 24 * 3600_000 },
};

export type KeyValue = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export const PROMPT_KEY = 'fv.feedback.prompts';
const MAX_OCCASIONS = 60;
type PromptState = {
  decided: Record<string, boolean>;
  asked: Partial<Record<PromptContext, number>>;
};

function readState(store: KeyValue): PromptState {
  try {
    const raw = JSON.parse(store.get(PROMPT_KEY) ?? '') as PromptState;
    if (raw && typeof raw.decided === 'object' && typeof raw.asked === 'object')
      return raw;
  } catch {
    /* Missing or corrupt: start over. */
  }
  return { decided: {}, asked: {} };
}

/**
 * Whether to show a rating prompt for one occasion (e.g. one finished puzzle).
 * The decision is remembered per occasion, so re-renders and reloads agree.
 */
export function decidePrompt(
  context: PromptContext,
  occasion: string,
  store: KeyValue,
  now: number,
  random: () => number,
): boolean {
  const state = readState(store);
  const key = `${context}:${occasion}`;
  if (key in state.decided) return state.decided[key];
  const rule = PROMPT_RULES[context];
  const last = state.asked[context] ?? 0;
  const show = now - last >= rule.cooldownMs && random() < rule.rate;
  if (show) state.asked[context] = now;
  state.decided[key] = show;
  const keys = Object.keys(state.decided);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_OCCASIONS)))
    delete state.decided[old];
  try {
    store.set(PROMPT_KEY, JSON.stringify(state));
  } catch {
    /* Storage full or blocked: the in-memory decision still applies. */
  }
  return show;
}

// Submissions that failed because the device was offline are kept and sent
// again when the connection returns.
export const OUTBOX_KEY = 'fv.feedback.outbox';
export const OUTBOX_LIMIT = 10;
export type Pending = {
  form: string;
  answers: Record<string, Answer>;
  subject?: string;
  code?: string;
  client?: Record<string, unknown>;
  queued: number;
};

export function readOutbox(store: KeyValue): Pending[] {
  try {
    const list = JSON.parse(store.get(OUTBOX_KEY) ?? '[]') as Pending[];
    return Array.isArray(list) ? list.slice(-OUTBOX_LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeOutbox(store: KeyValue, list: Pending[]) {
  try {
    store.set(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_LIMIT)));
  } catch {
    /* Best effort. */
  }
}

/** Contexts a player can open from the Help menu. */
export const HELP_CONTEXTS: FormContext[] = ['general', 'bug'];
