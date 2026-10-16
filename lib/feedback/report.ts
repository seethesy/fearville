// FEAR-175: pure helpers for the admin feedback viewer: response filters,
// star-rating statistics and CSV export. No D1 access here (unit tested).
import {
  FORM_CONTEXTS,
  type FormContext,
  type FormDefinition,
} from './forms.ts';

export const TRIAGE = ['new', 'triaged'] as const;
export type Triage = (typeof TRIAGE)[number];

export type ResponseRow = {
  id: string;
  form: string;
  context: string;
  version: number;
  account: string | null;
  guest: string | null;
  subject: string | null;
  answers: string;
  client: string | null;
  game: string | null;
  flagged: number;
  status: string;
  created: number;
};

export type Filters = {
  where: string;
  values: (string | number)[];
};

/** Build a WHERE clause from viewer query parameters. Unknown keys ignored. */
export function responseFilters(params: URLSearchParams): Filters {
  const where: string[] = [];
  const values: (string | number)[] = [];
  const context = params.get('context');
  if (context) {
    if (!FORM_CONTEXTS.includes(context as FormContext))
      throw Error('Choose a valid form.');
    where.push('context=?');
    values.push(context);
  }
  const version = params.get('version');
  if (version) {
    const n = Number(version);
    if (!Number.isSafeInteger(n) || n < 1) throw Error('Invalid version.');
    where.push('version=?');
    values.push(n);
  }
  const subject = params.get('subject');
  if (subject) {
    if (subject.length > 100) throw Error('Invalid subject.');
    where.push('subject=?');
    values.push(subject);
  }
  const status = params.get('status');
  if (status) {
    if (!TRIAGE.includes(status as Triage)) throw Error('Invalid status.');
    where.push('status=?');
    values.push(status);
  }
  if (params.get('flagged') === 'hide') where.push('flagged=0');
  for (const [key, op] of [
    ['from', '>='],
    ['to', '<='],
  ] as const) {
    const value = params.get(key);
    if (!value) continue;
    const at = Date.parse(value);
    if (!Number.isFinite(at)) throw Error('Use an ISO date for filters.');
    where.push(`created${op}?`);
    values.push(at);
  }
  return {
    where: where.length ? ' WHERE ' + where.join(' AND ') : '',
    values,
  };
}

export type StarStat = {
  label: string;
  count: number;
  average: number;
  distribution: [number, number, number, number, number];
};

const parseAnswers = (raw: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

/**
 * Average and 1–5 distribution for every star question in the responses,
 * keyed by question id. Uses each response's own form version for labels.
 */
export function starStats(
  rows: Pick<ResponseRow, 'form' | 'answers'>[],
  forms: Map<string, FormDefinition>,
): Record<string, StarStat> {
  const out: Record<string, StarStat & { sum: number }> = {};
  for (const row of rows) {
    const form = forms.get(row.form);
    if (!form) continue;
    const answers = parseAnswers(row.answers);
    for (const q of form.questions) {
      if (q.type !== 'stars') continue;
      const n = answers[q.id];
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 5)
        continue;
      const s = (out[q.id] ??= {
        label: q.label,
        count: 0,
        average: 0,
        sum: 0,
        distribution: [0, 0, 0, 0, 0],
      });
      s.label = q.label; // newest label wins (rows arrive newest first)
      s.count++;
      s.sum += n;
      s.distribution[n - 1]++;
    }
  }
  return Object.fromEntries(
    Object.entries(out).map(([id, { sum, ...s }]) => [
      id,
      { ...s, average: Math.round((sum / s.count) * 100) / 100 },
    ]),
  );
}

/** First star answer in a response, used for summary averages. */
export function primaryStars(
  row: Pick<ResponseRow, 'form' | 'answers'>,
  forms: Map<string, FormDefinition>,
): number | null {
  const form = forms.get(row.form);
  const q = form?.questions.find((x) => x.type === 'stars');
  if (!q) return null;
  const n = parseAnswers(row.answers)[q.id];
  return typeof n === 'number' && n >= 1 && n <= 5 ? n : null;
}

// Spreadsheet apps run cells that start with these as formulas.
const FORMULA = /^[=+\-@\t\r]/;
export function csvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : Array.isArray(value)
          ? value.join('; ')
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value as string | number | boolean);
  if (FORMULA.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** CSV with one column per question id seen in the rows. */
export function responsesCsv(rows: ResponseRow[]): string {
  const parsed = rows.map((r) => ({
    row: r,
    answers: parseAnswers(r.answers),
  }));
  const questionIds: string[] = [];
  for (const p of parsed)
    for (const key of Object.keys(p.answers))
      if (!questionIds.includes(key)) questionIds.push(key);
  const head = [
    'id',
    'created',
    'context',
    'version',
    'subject',
    'account',
    'guest',
    'status',
    'flagged',
    ...questionIds.map((q) => `answer:${q}`),
    'client',
    'game',
  ];
  const lines = [head.map(csvCell).join(',')];
  for (const { row, answers } of parsed)
    lines.push(
      [
        row.id,
        new Date(row.created).toISOString(),
        row.context,
        row.version,
        row.subject,
        row.account,
        row.guest,
        row.status,
        row.flagged ? 'yes' : 'no',
        ...questionIds.map((q) => answers[q]),
        row.client,
        row.game,
      ]
        .map(csvCell)
        .join(','),
    );
  return lines.join('\r\n') + '\r\n';
}
