// FEAR-175: the developer account's feedback form editor and response
// viewer. Every change goes through the admin audit log in one D1 batch.
import { database } from '@/db';
import { assertSQL } from '@/lib/admin/lobbies';
import {
  type Admin,
  auditStatement,
  commit,
  publicError,
} from '@/lib/admin/service/audit';
import {
  FORM_CONTEXTS,
  type FormContext,
  type FormDefinition,
  formId,
  isContext,
  validateForm,
} from './forms.ts';
import {
  type ResponseRow,
  TRIAGE,
  type Triage,
  primaryStars,
  responseFilters,
  responsesCsv,
  starStats,
} from './report.ts';

type FormRow = {
  id: string;
  context: string;
  version: number;
  active: number;
  definition: string;
  created: number;
  created_by: string | null;
};

async function allForms() {
  const rows = (
    await database()
      .prepare(
        'SELECT id,context,version,active,definition,created,created_by FROM feedback_forms ORDER BY context,version DESC',
      )
      .all<FormRow>()
  ).results;
  const defs = new Map<string, FormDefinition>();
  for (const r of rows) defs.set(r.id, JSON.parse(r.definition));
  return { rows, defs };
}

/** Every context with its versions, the active one and response counts. */
export async function formsOverview() {
  const { rows, defs } = await allForms();
  const counts = (
    await database()
      .prepare(
        "SELECT context,COUNT(*) AS total,SUM(status='new') AS open FROM feedback_submissions GROUP BY context",
      )
      .all<{ context: string; total: number; open: number }>()
  ).results;
  return FORM_CONTEXTS.map((context) => {
    const versions = rows.filter((r) => r.context === context);
    const latest = versions[0];
    return {
      context,
      active: versions.find((v) => v.active)?.version ?? null,
      latest: latest?.version ?? 0,
      definition: latest ? defs.get(latest.id)! : null,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        active: !!v.active,
        created: v.created,
        createdBy: v.created_by,
        questions: defs.get(v.id)!.questions.length,
      })),
      responses: counts.find((c) => c.context === context)?.total ?? 0,
      untriaged: counts.find((c) => c.context === context)?.open ?? 0,
    };
  });
}

async function audited<T>(
  admin: Admin,
  action: string,
  target: string,
  body: unknown,
  run: () => Promise<T>,
) {
  try {
    return await run();
  } catch (e) {
    await auditStatement(admin.id, action, target, body, 'error', undefined, {
      error: publicError(e),
    }).run();
    throw e;
  }
}

/**
 * Publish an edited form as a new version and make it live. Submissions keep
 * the version they answered. `expected` is the latest version the editor
 * loaded, so two tabs can't silently overwrite each other.
 */
export function publishForm(admin: Admin, body: Record<string, unknown>) {
  const target =
    typeof (body.definition as { context?: unknown })?.context === 'string'
      ? String((body.definition as { context: string }).context)
      : '';
  return audited(admin, 'feedback publish', target, body, async () => {
    const form = validateForm(body.definition);
    const expected = Number(body.expected);
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw Error('Reload the form before publishing.');
    const db = database();
    const before = await db
      .prepare(
        'SELECT id,definition FROM feedback_forms WHERE context=? ORDER BY version DESC LIMIT 1',
      )
      .bind(form.context)
      .first<{ id: string; definition: string }>();
    const version = expected + 1;
    const id = formId(form.context, version);
    return commit(
      admin,
      'feedback publish',
      { context: form.context, version },
      {
        target: form.context,
        before: before ? JSON.parse(before.definition) : null,
        after: form,
        output: { id, version },
        statements: [
          assertSQL(
            'COALESCE((SELECT MAX(version) FROM feedback_forms WHERE context=?),0)=?',
            form.context,
            expected,
          ),
          db
            .prepare(
              'UPDATE feedback_forms SET active=0 WHERE context=? AND active=1',
            )
            .bind(form.context),
          db
            .prepare(
              'INSERT INTO feedback_forms (id,context,version,active,definition,created,created_by) VALUES (?,?,?,1,?,?,?)',
            )
            .bind(
              id,
              form.context,
              version,
              JSON.stringify(form),
              Date.now(),
              admin.id,
            ),
        ],
      },
    );
  });
}

/**
 * Turn an entry point off (no active version: players see no prompt) or on
 * (activate a chosen version, default the latest; also used to roll back).
 */
export function setFormActive(admin: Admin, body: Record<string, unknown>) {
  const context = body.context;
  return audited(
    admin,
    'feedback activate',
    typeof context === 'string' ? context : '',
    body,
    async () => {
      if (!isContext(context)) throw Error('Choose a valid form.');
      const db = database();
      const current = await db
        .prepare(
          'SELECT version FROM feedback_forms WHERE context=? AND active=1',
        )
        .bind(context)
        .first<{ version: number }>();
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            'UPDATE feedback_forms SET active=0 WHERE context=? AND active=1',
          )
          .bind(context),
      ];
      let version: number | null = null;
      if (body.enabled === true) {
        const latest = await db
          .prepare(
            'SELECT MAX(version) AS v FROM feedback_forms WHERE context=?',
          )
          .bind(context)
          .first<{ v: number | null }>();
        version =
          body.version === undefined ? (latest?.v ?? 0) : Number(body.version);
        if (!Number.isSafeInteger(version) || version < 1)
          throw Error('Choose a version.');
        statements.push(
          assertSQL(
            'EXISTS (SELECT 1 FROM feedback_forms WHERE id=?)',
            formId(context, version),
          ),
          db
            .prepare('UPDATE feedback_forms SET active=1 WHERE id=?')
            .bind(formId(context, version)),
        );
      } else if (body.enabled !== false) throw Error('Choose on or off.');
      return commit(
        admin,
        version ? 'feedback enable' : 'feedback disable',
        { context, version },
        {
          target: context,
          before: { active: current?.version ?? null },
          after: { active: version },
          output: { context, active: version },
          statements,
        },
      );
    },
  );
}

/** Mark a submission (usually a bug report) triaged or back to new. */
export function triageResponse(admin: Admin, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id.slice(0, 64) : '';
  return audited(admin, 'feedback triage', id, body, async () => {
    const status = body.status as Triage;
    if (!TRIAGE.includes(status)) throw Error('Choose new or triaged.');
    const row = await database()
      .prepare('SELECT status FROM feedback_submissions WHERE id=?')
      .bind(id)
      .first<{ status: string }>();
    if (!row) throw Error('That response no longer exists.');
    return commit(
      admin,
      'feedback triage',
      { id, status },
      {
        target: id,
        before: { status: row.status },
        after: { status },
        output: { id, status },
        statements: [
          database()
            .prepare('UPDATE feedback_submissions SET status=? WHERE id=?')
            .bind(status, id),
        ],
      },
    );
  });
}

const STATS_CAP = 5000;
const CSV_CAP = 10000;

async function selectResponses(
  params: URLSearchParams,
  limit: number,
  offset = 0,
) {
  const f = responseFilters(params);
  return (
    await database()
      .prepare(
        `SELECT * FROM feedback_submissions${f.where} ORDER BY created DESC,id DESC LIMIT ? OFFSET ?`,
      )
      .bind(...f.values, limit, offset)
      .all<ResponseRow>()
  ).results;
}

/** One page of responses plus star statistics over everything matching. */
export async function responses(params: URLSearchParams) {
  const offset = Number(params.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw Error('Invalid page offset.');
  const [{ defs }, page, all] = await Promise.all([
    allForms(),
    selectResponses(params, 50, offset),
    selectResponses(params, STATS_CAP),
  ]);
  return {
    responses: page.map((r) => ({
      ...r,
      answers: JSON.parse(r.answers),
      client: r.client ? JSON.parse(r.client) : null,
      game: r.game ? JSON.parse(r.game) : null,
      questions: defs.get(r.form)?.questions ?? [],
    })),
    matched: all.length,
    capped: all.length >= STATS_CAP,
    stats: starStats(all, defs),
  };
}

export async function responsesExport(params: URLSearchParams) {
  return responsesCsv(await selectResponses(params, CSV_CAP));
}

const WEEK = 7 * 86400_000;
/** Console home: last 7 days of ratings and the bug backlog. */
export async function feedbackSummary(now = Date.now()) {
  const { defs } = await allForms();
  const rows = (
    await database()
      .prepare(
        'SELECT form,context,subject,answers FROM feedback_submissions WHERE created>=? AND context IN (?,?,?) LIMIT ?',
      )
      .bind(now - WEEK, 'puzzle', 'script', 'storyteller', STATS_CAP)
      .all<Pick<ResponseRow, 'form' | 'context' | 'subject' | 'answers'>>()
  ).results;
  const groups: Record<
    string,
    Record<string, { sum: number; count: number }>
  > = {};
  for (const r of rows) {
    const n = primaryStars(r, defs);
    if (n === null || !r.subject) continue;
    const g = ((groups[r.context] ??= {})[r.subject] ??= { sum: 0, count: 0 });
    g.sum += n;
    g.count++;
  }
  const averages = (context: FormContext) =>
    Object.entries(groups[context] ?? {}).map(([subject, g]) => ({
      subject,
      count: g.count,
      average: Math.round((g.sum / g.count) * 100) / 100,
    }));
  const counts = await database()
    .prepare(
      "SELECT SUM(created>=?) AS week, SUM(context='bug' AND status='new') AS bugs FROM feedback_submissions",
    )
    .bind(now - WEEK)
    .first<{ week: number | null; bugs: number | null }>();
  return {
    since: now - WEEK,
    responses: counts?.week ?? 0,
    untriagedBugs: counts?.bugs ?? 0,
    puzzles: averages('puzzle'),
    scripts: averages('script'),
    storyteller: averages('storyteller'),
  };
}
