// FEAR-159: D1 access for feedback forms and submissions.
import { database } from '@/db';
import { uuid } from '@/lib/game/types';
import { isObjectionable } from '@/lib/social/moderation';
import {
  type Answer,
  type FormContext,
  type FormDefinition,
  formId,
  validateAnswers,
  validateForm,
  validSubject,
} from './forms';

export type StoredForm = FormDefinition & { id: string; version: number };

const parse = (row: { id: string; version: number; definition: string }) => ({
  ...(JSON.parse(row.definition) as FormDefinition),
  id: row.id,
  version: row.version,
});

export async function activeForm(
  context: FormContext,
): Promise<StoredForm | null> {
  const row = await database()
    .prepare(
      'SELECT id,version,definition FROM feedback_forms WHERE context=? AND active=1',
    )
    .bind(context)
    .first<{ id: string; version: number; definition: string }>();
  return row ? parse(row) : null;
}

async function formById(id: string) {
  const row = await database()
    .prepare('SELECT id,version,definition FROM feedback_forms WHERE id=?')
    .bind(id)
    .first<{ id: string; version: number; definition: string }>();
  return row ? parse(row) : null;
}

/** Store a new version of a form and make it the active one (for the editor). */
export async function publishForm(value: unknown, by: string, now: number) {
  const form = validateForm(value);
  const db = database();
  const latest = await db
    .prepare('SELECT MAX(version) AS v FROM feedback_forms WHERE context=?')
    .bind(form.context)
    .first<{ v: number | null }>();
  const version = (latest?.v ?? 0) + 1;
  const id = formId(form.context, version);
  await db.batch([
    db
      .prepare(
        'UPDATE feedback_forms SET active=0 WHERE context=? AND active=1',
      )
      .bind(form.context),
    db
      .prepare(
        'INSERT INTO feedback_forms (id,context,version,active,definition,created,created_by) VALUES (?,?,?,1,?,?,?)',
      )
      .bind(id, form.context, version, JSON.stringify(form), now, by),
  ]);
  return { id, version };
}

export type Submission = {
  form: unknown;
  answers: unknown;
  subject?: unknown;
  account: string | null;
  guest: string | null;
  client?: Record<string, unknown>;
  game?: Record<string, unknown>;
};

export async function submitFeedback(s: Submission, now: number) {
  if (typeof s.form !== 'string' || s.form.length > 40)
    throw Error('Choose a form.');
  // The version the client loaded is accepted even if a newer one went live.
  const form = await formById(s.form);
  if (!form) throw Error('That form is no longer available. Reload it.');
  const answers: Record<string, Answer> = validateAnswers(form, s.answers);
  if (!Object.keys(answers).length) throw Error('Answer the form.');
  const subject = validSubject(form, s.subject);
  const text = Object.values(answers)
    .filter((a): a is string => typeof a === 'string')
    .join('\n');
  const id = uuid();
  await database()
    .prepare(
      'INSERT INTO feedback_submissions (id,form,context,version,account,guest,subject,answers,client,game,flagged,status,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      id,
      form.id,
      form.context,
      form.version,
      s.account,
      s.account ? null : s.guest,
      subject,
      JSON.stringify(answers),
      form.context === 'bug' && s.client ? JSON.stringify(s.client) : null,
      form.context === 'bug' && s.game ? JSON.stringify(s.game) : null,
      // Kept, never rejected (a bug report may quote what someone wrote),
      // but flagged so review screens can hide it by default.
      text && isObjectionable(text) ? 1 : 0,
      'new',
      now,
    )
    .run();
  return { id };
}
