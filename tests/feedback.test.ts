import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import {
  DEFAULT_FORMS,
  FORM_CONTEXTS,
  clientContext,
  gameContext,
  validateAnswers,
  validateForm,
  validSubject,
  type FormDefinition,
} from '../lib/feedback/forms.ts';

const form = (context: string) =>
  DEFAULT_FORMS.find((f) => f.context === context)!;

void test('default forms are valid and the migration seeds exactly them as version 1', () => {
  assert.deepEqual(
    DEFAULT_FORMS.map((f) => f.context).sort(),
    [...FORM_CONTEXTS].sort(),
  );
  for (const f of DEFAULT_FORMS) assert.deepEqual(validateForm(f), f);
  const db = new DatabaseSync(':memory:');
  try {
    for (const file of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    const rows = db
      .prepare('SELECT id,version,active,definition FROM feedback_forms')
      .all() as {
      id: string;
      version: number;
      active: number;
      definition: string;
    }[];
    assert.equal(rows.length, DEFAULT_FORMS.length);
    for (const f of DEFAULT_FORMS) {
      const row = rows.find((r) => r.id === `${f.context}:1`);
      assert.ok(row && row.active === 1 && row.version === 1);
      assert.deepEqual(JSON.parse(row.definition), f);
    }
    // Only one active version per context.
    assert.throws(() =>
      db.exec(
        "INSERT INTO feedback_forms VALUES ('bug:2','bug',2,1,'{}',0,NULL)",
      ),
    );
  } finally {
    db.close();
  }
});

void test('form definitions reject malformed questions', () => {
  const ok: FormDefinition = {
    context: 'general',
    title: 'T',
    questions: [{ id: 'a', type: 'short', label: 'A' }],
  };
  assert.throws(() => validateForm({ ...ok, context: 'nope' }), /context/);
  assert.throws(() => validateForm({ ...ok, questions: [] }), /1–20/);
  assert.throws(
    () =>
      validateForm({
        ...ok,
        questions: [ok.questions[0], ok.questions[0]],
      }),
    /unique/,
  );
  assert.throws(
    () =>
      validateForm({
        ...ok,
        questions: [
          {
            id: 'c',
            type: 'single',
            label: 'C',
            options: [{ id: 'x', label: 'X' }],
          },
        ],
      }),
    /2–12 options/,
  );
  assert.throws(
    () =>
      validateForm({
        ...ok,
        questions: [{ id: 'a', type: 'video', label: 'A' }],
      }),
    /question type/,
  );
});

void test('answers are validated per question type and cleaned', () => {
  const general = form('general');
  assert.deepEqual(
    validateAnswers(general, {
      overall: 4,
      area: 'social',
      comment: '  Love it\u0007 \n',
    }),
    { overall: 4, area: 'social', comment: 'Love it' },
  );
  assert.throws(() => validateAnswers(general, { overall: 4 }), /Tell us more/);
  assert.throws(
    () => validateAnswers(general, { comment: 'x', overall: 6 }),
    /1 to 5/,
  );
  assert.throws(
    () => validateAnswers(general, { comment: 'x', area: 'nope' }),
    /option/,
  );
  assert.throws(
    () => validateAnswers(general, { comment: 'x', extra: 1 }),
    /form changed/,
  );
  assert.throws(
    () => validateAnswers(general, { comment: 'x'.repeat(4001) }),
    /4000/,
  );
  assert.deepEqual(
    validateAnswers(form('game-end'), {
      rating: 5,
      highlights: ['rite', 'rite', 'app'],
    }),
    { rating: 5, highlights: ['rite', 'app'] },
  );
});

void test('subjects are bound to the form kind', () => {
  assert.equal(validSubject(form('script'), 'horrors'), 'horrors');
  assert.equal(validSubject(form('puzzle'), 'lab'), 'lab');
  assert.throws(() => validSubject(form('puzzle'), 'chess'), /subject/);
  assert.equal(validSubject(form('general'), 'horrors'), null);
  assert.equal(validSubject(form('script'), undefined), null);
});

void test('bug context keeps only whitelisted fields and no hidden information', () => {
  assert.deepEqual(
    clientContext({
      appVersion: '1.2.3',
      platform: 'ios',
      requestIds: Array.from({ length: 30 }, (_, i) => 'r' + i),
      role: 'monster',
      notes: 'secret',
    }),
    {
      appVersion: '1.2.3',
      platform: 'ios',
      requestIds: Array.from({ length: 20 }, (_, i) => 'r' + (i + 10)),
    },
  );
  const context = gameContext(
    {
      code: 'ABCDEF',
      phase: 'night',
      day: 1,
      night: 2,
      script: 'horrors',
      players: [{ role: 'monster', notes: 'x' }],
    },
    false,
  );
  assert.deepEqual(Object.keys(context).sort(), [
    'code',
    'day',
    'night',
    'phase',
    'players',
    'sandbox',
    'script',
    'viewer',
  ]);
  assert.equal(context.players, 1);
});
