import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FORMS, type FormDefinition } from '../lib/feedback/forms.ts';
import {
  csvCell,
  primaryStars,
  responseFilters,
  responsesCsv,
  starStats,
  type ResponseRow,
} from '../lib/feedback/report.ts';

const forms = new Map<string, FormDefinition>(
  DEFAULT_FORMS.map((f) => [`${f.context}:1`, f]),
);
const row = (over: Partial<ResponseRow>): ResponseRow => ({
  id: 'r',
  form: 'puzzle:1',
  context: 'puzzle',
  version: 1,
  account: null,
  guest: null,
  subject: 'board',
  answers: '{}',
  client: null,
  game: null,
  flagged: 0,
  status: 'new',
  created: 0,
  ...over,
});

void test('filters build parameterised SQL and reject bad values', () => {
  const f = responseFilters(
    new URLSearchParams({
      context: 'puzzle',
      version: '2',
      subject: 'board',
      status: 'new',
      flagged: 'hide',
      from: '2026-10-01T00:00:00Z',
    }),
  );
  assert.equal(
    f.where,
    ' WHERE context=? AND version=? AND subject=? AND status=? AND flagged=0 AND created>=?',
  );
  assert.deepEqual(f.values, ['puzzle', 2, 'board', 'new', Date.parse('2026-10-01T00:00:00Z')]);
  assert.equal(responseFilters(new URLSearchParams()).where, '');
  assert.throws(() => responseFilters(new URLSearchParams({ context: 'x' })));
  assert.throws(() => responseFilters(new URLSearchParams({ status: 'fixed' })));
  assert.throws(() => responseFilters(new URLSearchParams({ version: '0' })));
  assert.throws(() => responseFilters(new URLSearchParams({ from: 'soon' })));
});

void test('star stats give average and distribution per question', () => {
  const stats = starStats(
    [
      row({ answers: '{"rating":5}' }),
      row({ answers: '{"rating":4,"difficulty":"hard"}' }),
      row({ answers: '{"rating":4}' }),
      row({ answers: '{"rating":9}' }), // ignored: out of range
      row({ answers: 'not json' }),
      row({ form: 'missing:1', answers: '{"rating":1}' }),
    ],
    forms,
  );
  assert.deepEqual(Object.keys(stats), ['rating']);
  assert.equal(stats.rating.count, 3);
  assert.equal(stats.rating.average, 4.33);
  assert.deepEqual(stats.rating.distribution, [0, 0, 0, 2, 1]);
  assert.equal(primaryStars(row({ answers: '{"rating":2}' }), forms), 2);
  assert.equal(
    primaryStars(row({ form: 'bug:1', answers: '{"what":"x"}' }), forms),
    null,
  );
});

void test('CSV escapes quotes and neutralises spreadsheet formulas', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell(['a', 'b']), 'a; b');
  assert.equal(csvCell(null), '');
  const csv = responsesCsv([
    row({ id: '1', answers: '{"rating":5,"comment":"line\\nbreak"}', created: 0 }),
    row({ id: '2', answers: '{"difficulty":"easy"}', created: 1000 }),
  ]);
  const lines = csv.split('\r\n');
  assert.equal(
    lines[0],
    'id,created,context,version,subject,account,guest,status,flagged,answer:rating,answer:comment,answer:difficulty,client,game',
  );
  assert.ok(lines[1].startsWith('1,1970-01-01T00:00:00.000Z,puzzle,1,board,'));
  assert.ok(lines[1].includes('"line\nbreak"'));
});
