// FEAR-159: feedback and bug report forms whose content lives in data (D1),
// so the developer account can change them without a deploy. Pure helpers:
// validation of form definitions and answers, and the context whitelists.
import { PATTERNS } from '../rite/types.ts';
import { SCRIPTS } from '../game/types.ts';

export const FORM_CONTEXTS = [
  'general',
  'bug',
  'script',
  'puzzle',
  'game-end',
] as const;
export type FormContext = (typeof FORM_CONTEXTS)[number];
export const QUESTION_TYPES = [
  'stars',
  'single',
  'multi',
  'short',
  'long',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
// What a form's ratings are about, filled automatically by the client.
export const SUBJECT_KINDS = ['script', 'puzzle', 'game'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

export type Choice = { id: string; label: string };
export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  required?: boolean;
  options?: Choice[]; // single and multi only
};
export type FormDefinition = {
  context: FormContext;
  title: string;
  intro?: string;
  subject?: SubjectKind;
  questions: Question[];
};
export type Answer = number | string | string[];

export const LIMITS = {
  questions: 20,
  options: 12,
  label: 200,
  title: 120,
  intro: 600,
  short: 200,
  long: 4000,
  body: 16000,
};
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const fail = (message: string): never => {
  throw Error(message);
};
const str = (value: unknown, max: number, what: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(`${what} must be 1–${max} characters.`);
  return (value as string).trim();
};

export const isContext = (value: unknown): value is FormContext =>
  FORM_CONTEXTS.includes(value as FormContext);
export const formId = (context: FormContext, version: number) =>
  `${context}:${version}`;

/** Validate a form definition before it is stored as a new version. */
export function validateForm(value: unknown): FormDefinition {
  const f = (value ?? {}) as Record<string, unknown>;
  if (!isContext(f.context)) fail('Choose a valid form context.');
  if (
    f.subject !== undefined &&
    !SUBJECT_KINDS.includes(f.subject as SubjectKind)
  )
    fail('Choose a valid subject.');
  const questions = f.questions;
  if (
    !Array.isArray(questions) ||
    !questions.length ||
    questions.length > LIMITS.questions
  )
    fail(`A form needs 1–${LIMITS.questions} questions.`);
  const ids = new Set<string>();
  const parsed = (questions as Record<string, unknown>[]).map((q) => {
    if (typeof q?.id !== 'string' || !ID.test(q.id) || ids.has(q.id))
      fail('Each question needs a unique short id.');
    ids.add(q.id as string);
    if (!QUESTION_TYPES.includes(q.type as QuestionType))
      fail('Choose a valid question type.');
    const question: Question = {
      id: q.id as string,
      type: q.type as QuestionType,
      label: str(q.label, LIMITS.label, 'A question'),
    };
    if (q.required) question.required = true;
    if (question.type === 'single' || question.type === 'multi') {
      const options = q.options;
      if (
        !Array.isArray(options) ||
        options.length < 2 ||
        options.length > LIMITS.options
      )
        fail(`Choice questions need 2–${LIMITS.options} options.`);
      const seen = new Set<string>();
      question.options = (options as Record<string, unknown>[]).map((o) => {
        if (typeof o?.id !== 'string' || !ID.test(o.id) || seen.has(o.id))
          fail('Each option needs a unique short id.');
        seen.add(o.id as string);
        return {
          id: o.id as string,
          label: str(o.label, LIMITS.label, 'An option'),
        };
      });
    } else if (q.options !== undefined)
      fail('Only choice questions have options.');
    return question;
  });
  return {
    context: f.context as FormContext,
    title: str(f.title, LIMITS.title, 'The title'),
    ...(f.intro ? { intro: str(f.intro, LIMITS.intro, 'The intro') } : {}),
    ...(f.subject ? { subject: f.subject as SubjectKind } : {}),
    questions: parsed,
  };
}

// Plain text only: drop control characters except newlines and tabs.
export function cleanText(value: string, max: number) {
  const kept = Array.from(value)
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127);
    })
    .join('');
  return kept.trim().slice(0, max);
}

/** Validate answers against a form. Unknown question ids are rejected. */
export function validateAnswers(
  form: FormDefinition,
  value: unknown,
): Record<string, Answer> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Answer the form.');
  const given = value as Record<string, unknown>;
  for (const key of Object.keys(given))
    if (!form.questions.some((q) => q.id === key))
      fail('The form changed. Reload it and try again.');
  const answers: Record<string, Answer> = {};
  for (const q of form.questions) {
    const a = given[q.id];
    const empty =
      a === undefined ||
      a === null ||
      a === '' ||
      (Array.isArray(a) && !a.length);
    if (empty) {
      if (q.required) fail(`Answer “${q.label}”.`);
      continue;
    }
    switch (q.type) {
      case 'stars': {
        const n = Number(a);
        if (!Number.isInteger(n) || n < 1 || n > 5)
          fail('Choose 1 to 5 stars.');
        answers[q.id] = n;
        break;
      }
      case 'single':
        if (!q.options!.some((o) => o.id === a)) fail('Choose an option.');
        answers[q.id] = a as string;
        break;
      case 'multi': {
        if (
          !Array.isArray(a) ||
          a.some((x) => !q.options!.some((o) => o.id === x))
        )
          fail('Choose from the listed options.');
        answers[q.id] = [...new Set(a as string[])];
        break;
      }
      case 'short':
      case 'long': {
        if (typeof a !== 'string') fail('Write your answer as text.');
        const max = q.type === 'short' ? LIMITS.short : LIMITS.long;
        if ((a as string).length > max)
          fail(`Keep answers under ${max} characters.`);
        const text = cleanText(a as string, max);
        if (text) answers[q.id] = text;
        else if (q.required) fail(`Answer “${q.label}”.`);
        break;
      }
    }
  }
  return answers;
}

/** The subject a form's ratings are about, e.g. a script or puzzle id. */
export function validSubject(form: FormDefinition, value: unknown) {
  if (!form.subject) return null;
  if (value === undefined || value === null || value === '') return null;
  const allowed: readonly string[] =
    form.subject === 'script'
      ? Object.keys(SCRIPTS)
      : form.subject === 'puzzle'
        ? Object.keys(PATTERNS)
        : [];
  if (form.subject === 'game') {
    if (typeof value !== 'string' || value.length > 100) fail('Choose a game.');
    return value as string;
  }
  if (!allowed.includes(value as string)) fail('Choose a valid subject.');
  return value as string;
}

// Client-reported app details (bug reports). Whitelisted and bounded; any
// other field is dropped. Never roles, alignments, notes or chat.
export function clientContext(value: unknown) {
  const v = (value ?? {}) as Record<string, unknown>;
  const s = (key: string, max = 80) =>
    typeof v[key] === 'string' && v[key]
      ? cleanText(v[key] as string, max)
      : undefined;
  const requestIds = Array.isArray(v.requestIds)
    ? v.requestIds
        .filter((x): x is string => typeof x === 'string')
        .slice(-20)
        .map((x) => cleanText(x, 64))
    : undefined;
  const out = {
    appVersion: s('appVersion'),
    build: s('build'),
    platform: s('platform', 20),
    os: s('os'),
    connection: s('connection', 20),
    traceId: s('traceId', 64),
    requestIds: requestIds?.length ? requestIds : undefined,
  };
  return Object.fromEntries(
    Object.entries(out).filter(([, x]) => x !== undefined),
  );
}

// Table details the server attaches to a bug report from a seated reporter.
// Public phase information only: nothing that is hidden from other players.
export function gameContext(
  g: {
    code: string;
    phase: string;
    day: number;
    night: number;
    script?: string;
    sandbox?: boolean;
    players: unknown[];
  },
  host: boolean,
) {
  return {
    code: g.code,
    phase: g.phase,
    day: g.day,
    night: g.night,
    script: g.script ?? 'horrors',
    sandbox: !!g.sandbox,
    players: g.players.length,
    viewer: host ? 'storyteller' : 'player',
  };
}

// Minimal starting forms, one per context. Art replaces them with the editor.
// Version 1 of each is inserted by the migration (drizzle/0011_*.sql).
export const DEFAULT_FORMS: FormDefinition[] = [
  {
    context: 'general',
    title: 'Send feedback',
    questions: [
      { id: 'overall', type: 'stars', label: 'How is Fearville so far?' },
      {
        id: 'area',
        type: 'single',
        label: 'What is this about?',
        options: [
          { id: 'game', label: 'Playing a game' },
          { id: 'storyteller', label: 'Storyteller tools' },
          { id: 'social', label: 'Friends and profiles' },
          { id: 'other', label: 'Something else' },
        ],
      },
      { id: 'comment', type: 'long', label: 'Tell us more', required: true },
    ],
  },
  {
    context: 'bug',
    title: 'Report a problem',
    questions: [
      {
        id: 'what',
        type: 'long',
        label: 'What happened?',
        required: true,
      },
      {
        id: 'expected',
        type: 'long',
        label: 'What did you expect to happen?',
      },
      { id: 'email', type: 'short', label: 'Contact email (optional)' },
    ],
  },
  {
    context: 'script',
    title: 'Rate this script',
    subject: 'script',
    questions: [
      {
        id: 'rating',
        type: 'stars',
        label: 'How much did you enjoy this script?',
        required: true,
      },
      { id: 'comment', type: 'long', label: 'Anything to add?' },
    ],
  },
  {
    context: 'puzzle',
    title: 'Rate this puzzle',
    subject: 'puzzle',
    questions: [
      {
        id: 'rating',
        type: 'stars',
        label: 'How much did you enjoy this puzzle?',
        required: true,
      },
      {
        id: 'difficulty',
        type: 'single',
        label: 'How hard was it?',
        options: [
          { id: 'easy', label: 'Too easy' },
          { id: 'right', label: 'About right' },
          { id: 'hard', label: 'Too hard' },
        ],
      },
      { id: 'comment', type: 'long', label: 'Anything to add?' },
    ],
  },
  {
    context: 'game-end',
    title: 'How was the game?',
    subject: 'game',
    questions: [
      {
        id: 'rating',
        type: 'stars',
        label: 'How much fun was this game?',
        required: true,
      },
      {
        id: 'highlights',
        type: 'multi',
        label: 'What stood out?',
        options: [
          { id: 'roles', label: 'Characters' },
          { id: 'rite', label: 'Night Rite' },
          { id: 'voting', label: 'Nominations and voting' },
          { id: 'app', label: 'The app' },
        ],
      },
      { id: 'comment', type: 'long', label: 'Anything to add?' },
    ],
  },
];
