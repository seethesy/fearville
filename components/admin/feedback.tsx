'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { adminRequest } from '@/components/ui-text';
import { FeedbackForm } from '@/components/feedback/form';
import {
  FORM_CONTEXTS,
  LIMITS,
  QUESTION_TYPES,
  SUBJECT_KINDS,
  type FormContext,
  type FormDefinition,
  type Question,
  type QuestionType,
  validateForm,
} from '@/lib/feedback/forms';
import type { StarStat } from '@/lib/feedback/report';
import { PATTERNS } from '@/lib/rite/types';
import { SCRIPTS } from '@/lib/game/types';

// FEAR-175: edit feedback forms without a deploy, and read what came in.

const CONTEXT_NAMES: Record<FormContext, string> = {
  general: 'Send feedback (Help menu)',
  bug: 'Report a problem (Help menu)',
  script: 'Rate the script (players, after a game)',
  puzzle: 'Rate the puzzle (after a Night Rite puzzle)',
  'game-end': 'Rate the game (not shown yet)',
  storyteller: 'Storyteller post-game form',
};
const TYPE_NAMES: Record<QuestionType, string> = {
  stars: '1–5 stars',
  single: 'Pick one',
  multi: 'Pick any',
  short: 'Short text',
  long: 'Long text',
};
const SUBJECT_NAMES: Record<string, string> = { ...PATTERNS, ...SCRIPTS };
const subjectName = (s: string | null) => (s ? (SUBJECT_NAMES[s] ?? s) : '—');

type Version = {
  id: string;
  version: number;
  active: boolean;
  created: number;
  createdBy: string | null;
  questions: number;
};
type Overview = {
  context: FormContext;
  active: number | null;
  latest: number;
  definition: FormDefinition | null;
  versions: Version[];
  responses: number;
  untriaged: number;
};

async function adminGet<T>(query: string): Promise<T> {
  const r = await fetch('/api/admin?' + query, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error ?? 'Request failed.');
  return data;
}

export function FeedbackAdmin() {
  const [view, setView] = useState<'forms' | 'responses'>('forms');
  return (
    <section>
      <div className="admin-actions">
        <h2>Feedback</h2>
        <button
          className={view === 'forms' ? 'primary' : 'secondary'}
          aria-pressed={view === 'forms'}
          onClick={() => setView('forms')}
        >
          Forms
        </button>
        <button
          className={view === 'responses' ? 'primary' : 'secondary'}
          aria-pressed={view === 'responses'}
          onClick={() => setView('responses')}
        >
          Responses
        </button>
      </div>
      {view === 'forms' ? <FormEditor /> : <ResponseViewer />}
    </section>
  );
}

// ---------- Form editor ----------

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
function freshId(prefix: string, taken: string[]) {
  let n = taken.length + 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
const blankForm = (context: FormContext): FormDefinition => ({
  context,
  title: 'New form',
  questions: [{ id: 'q1', type: 'stars', label: 'How was it?' }],
});

function FormEditor() {
  const [forms, setForms] = useState<Overview[] | null>(null);
  const [context, setContext] = useState<FormContext>('general');
  const [draft, setDraft] = useState<FormDefinition | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const current = forms?.find((f) => f.context === context);
  const load = useCallback(async () => {
    try {
      const data = await adminGet<{ forms: Overview[] }>('view=feedback-forms');
      setForms(data.forms);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load forms.');
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (!current || dirty) return;
    const t = setTimeout(
      () =>
        setDraft(
          structuredClone(current.definition ?? blankForm(current.context)),
        ),
      0,
    );
    return () => clearTimeout(t);
  }, [current, dirty]);
  const problem = useMemo(() => {
    if (!draft) return '';
    try {
      validateForm(draft);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid form.';
    }
  }, [draft]);
  const edit = (f: (d: FormDefinition) => void) => {
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      f(next);
      return next;
    });
    setDirty(true);
    setNotice('');
  };
  const editQ = (i: number, f: (q: Question) => void) =>
    edit((d) => f(d.questions[i]));
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError('');
    try {
      await adminRequest({ action: 'feedback', ...body });
      setDirty(false);
      setNotice(done);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel feedback-editor">
      <label>
        Form
        <select
          value={context}
          onChange={(e) => {
            if (
              dirty &&
              !window.confirm('Discard unpublished changes to this form?')
            )
              return;
            setContext(e.target.value as FormContext);
            setDirty(false);
            setNotice('');
          }}
        >
          {FORM_CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {CONTEXT_NAMES[c]}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <div className="admin-actions">
          <p>
            {current.active
              ? `Live: version ${current.active} of ${current.latest}.`
              : 'Off: players see no prompt or button for this form.'}{' '}
            {current.responses} responses ({current.untriaged} new).
          </p>
          {current.active ? (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void send(
                  { op: 'activate', context, enabled: false },
                  'Entry point turned off.',
                )
              }
            >
              Turn off
            </button>
          ) : (
            current.latest > 0 && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void send(
                    { op: 'activate', context, enabled: true },
                    'Entry point turned on.',
                  )
                }
              >
                Turn on (latest)
              </button>
            )
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <output className="hint">{notice}</output>}
      {draft && current && (
        <div className="feedback-editor-grid">
          <div className="feedback-editor-fields">
            <label>
              Title
              <input
                value={draft.title}
                maxLength={LIMITS.title}
                onChange={(e) => edit((d) => void (d.title = e.target.value))}
              />
            </label>
            <label>
              Intro (optional)
              <textarea
                rows={2}
                value={draft.intro ?? ''}
                maxLength={LIMITS.intro}
                onChange={(e) =>
                  edit((d) => {
                    if (e.target.value) d.intro = e.target.value;
                    else delete d.intro;
                  })
                }
              />
            </label>
            <label>
              Ratings are about
              <select
                value={draft.subject ?? ''}
                onChange={(e) =>
                  edit((d) => {
                    if (e.target.value)
                      d.subject = e.target.value as FormDefinition['subject'];
                    else delete d.subject;
                  })
                }
              >
                <option value="">Nothing specific</option>
                {SUBJECT_KINDS.map((s) => (
                  <option key={s} value={s}>
                    The {s}
                  </option>
                ))}
              </select>
            </label>
            <ol className="feedback-questions">
              {draft.questions.map((q, i) => (
                <li key={i}>
                  <div className="admin-actions">
                    <strong>Question {i + 1}</strong>
                    <button
                      className="icon-button"
                      aria-label={`Move question ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() =>
                        edit((d) =>
                          d.questions.splice(
                            i - 1,
                            2,
                            d.questions[i],
                            d.questions[i - 1],
                          ),
                        )
                      }
                    >
                      <ArrowUp aria-hidden="true" size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move question ${i + 1} down`}
                      disabled={i === draft.questions.length - 1}
                      onClick={() =>
                        edit((d) =>
                          d.questions.splice(
                            i,
                            2,
                            d.questions[i + 1],
                            d.questions[i],
                          ),
                        )
                      }
                    >
                      <ArrowDown aria-hidden="true" size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove question ${i + 1}`}
                      disabled={draft.questions.length === 1}
                      onClick={() => edit((d) => d.questions.splice(i, 1))}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </button>
                  </div>
                  <label>
                    Wording
                    <input
                      value={q.label}
                      maxLength={LIMITS.label}
                      onChange={(e) =>
                        editQ(i, (x) => void (x.label = e.target.value))
                      }
                    />
                  </label>
                  <div className="admin-filters">
                    <label>
                      Type
                      <select
                        value={q.type}
                        onChange={(e) =>
                          editQ(i, (x) => {
                            x.type = e.target.value as QuestionType;
                            if (x.type === 'single' || x.type === 'multi')
                              x.options ??= [
                                { id: 'o1', label: 'Option 1' },
                                { id: 'o2', label: 'Option 2' },
                              ];
                            else delete x.options;
                          })
                        }
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_NAMES[t]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Answer key
                      <input
                        value={q.id}
                        maxLength={32}
                        aria-invalid={!ID.test(q.id)}
                        title="Stats are grouped by this key across versions. Keep it when you only reword."
                        onChange={(e) =>
                          editQ(
                            i,
                            (x) => void (x.id = e.target.value.toLowerCase()),
                          )
                        }
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!q.required}
                        onChange={(e) =>
                          editQ(i, (x) => {
                            if (e.target.checked) x.required = true;
                            else delete x.required;
                          })
                        }
                      />{' '}
                      Required
                    </label>
                  </div>
                  {q.options && (
                    <ul className="feedback-options">
                      {q.options.map((o, j) => (
                        <li key={j}>
                          <input
                            aria-label={`Option ${j + 1}`}
                            value={o.label}
                            maxLength={LIMITS.label}
                            onChange={(e) =>
                              editQ(
                                i,
                                (x) =>
                                  void (x.options![j].label = e.target.value),
                              )
                            }
                          />
                          <button
                            className="icon-button"
                            aria-label={`Remove option ${j + 1}`}
                            disabled={q.options!.length <= 2}
                            onClick={() =>
                              editQ(i, (x) => x.options!.splice(j, 1))
                            }
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          className="secondary"
                          disabled={q.options.length >= LIMITS.options}
                          onClick={() =>
                            editQ(i, (x) =>
                              x.options!.push({
                                id: freshId(
                                  'o',
                                  x.options!.map((o) => o.id),
                                ),
                                label: `Option ${x.options!.length + 1}`,
                              }),
                            )
                          }
                        >
                          <Plus aria-hidden="true" size={14} /> Add option
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              ))}
            </ol>
            <button
              className="secondary"
              disabled={draft.questions.length >= LIMITS.questions}
              onClick={() =>
                edit((d) =>
                  d.questions.push({
                    id: freshId(
                      'q',
                      d.questions.map((q) => q.id),
                    ),
                    type: 'long',
                    label: 'Anything to add?',
                  }),
                )
              }
            >
              <Plus aria-hidden="true" size={14} /> Add question
            </button>
            {problem && (
              <p className="error" role="alert">
                {problem}
              </p>
            )}
            <div className="admin-actions">
              <button
                className="primary"
                disabled={busy || !dirty || !!problem}
                onClick={() =>
                  void send(
                    {
                      op: 'publish',
                      definition: draft,
                      expected: current.latest,
                    },
                    'Published. New responses use this version.',
                  )
                }
              >
                Publish as version {current.latest + 1}
              </button>
              <button
                className="secondary"
                disabled={busy || !dirty}
                onClick={() => {
                  setDirty(false);
                  setNotice('');
                }}
              >
                Discard changes
              </button>
            </div>
          </div>
          <div className="feedback-preview">
            <p className="eyebrow">PREVIEW AS A PLAYER</p>
            <h3>{draft.title}</h3>
            {!problem && (
              <FeedbackForm key={JSON.stringify(draft)} form={draft} preview />
            )}
          </div>
        </div>
      )}
      {current && current.versions.length > 0 && (
        <details>
          <summary>Version history ({current.versions.length})</summary>
          <ul className="feedback-versions">
            {current.versions.map((v) => (
              <li key={v.id}>
                Version {v.version} · {v.questions} questions ·{' '}
                {v.created ? new Date(v.created).toLocaleString() : 'seed'}
                {v.active ? (
                  <strong> · live</strong>
                ) : (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void send(
                        {
                          op: 'activate',
                          context,
                          enabled: true,
                          version: v.version,
                        },
                        `Version ${v.version} is live.`,
                      )
                    }
                  >
                    Make live
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---------- Response viewer ----------

type Response = {
  id: string;
  context: FormContext;
  version: number;
  account: string | null;
  guest: string | null;
  subject: string | null;
  answers: Record<string, unknown>;
  client: Record<string, unknown> | null;
  game: Record<string, unknown> | null;
  flagged: number;
  status: 'new' | 'triaged';
  created: number;
  questions: Question[];
};

function answerText(q: Question | undefined, a: unknown) {
  if (q?.type === 'stars') return '★'.repeat(Number(a)) + ` (${Number(a)}/5)`;
  const label = (id: unknown) =>
    q?.options?.find((o) => o.id === id)?.label ?? String(id);
  if (Array.isArray(a)) return a.map(label).join(', ');
  return q?.options ? label(a) : String(a);
}

function ResponseViewer() {
  const [filters, setFilters] = useState({
    context: '',
    version: '',
    subject: '',
    status: '',
    from: '',
    to: '',
    flagged: 'hide',
  });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{
    responses: Response[];
    matched: number;
    capped: boolean;
    stats: Record<string, StarStat>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (!v) continue;
      q.set(
        k,
        k === 'from' || k === 'to' ? new Date(v).toISOString() : String(v),
      );
    }
    return q;
  }, [filters]);
  const load = useCallback(
    async (page: number) => {
      setBusy(true);
      try {
        const q = new URLSearchParams(query);
        q.set('view', 'feedback');
        q.set('offset', String(page));
        setData(await adminGet(q.toString()));
        setOffset(page);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load responses.');
      } finally {
        setBusy(false);
      }
    },
    [query],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(0), 0);
    return () => clearTimeout(t);
  }, [load]);
  async function triage(r: Response) {
    setBusy(true);
    try {
      await adminRequest({
        action: 'feedback',
        op: 'triage',
        id: r.id,
        status: r.status === 'new' ? 'triaged' : 'new',
      });
      await load(offset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
      setBusy(false);
    }
  }
  const set = (k: keyof typeof filters, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));
  const csv = new URLSearchParams(query);
  csv.set('view', 'feedback-csv');
  return (
    <div className="panel">
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void load(0);
        }}
      >
        <label>
          Form
          <select
            value={filters.context}
            onChange={(e) => set('context', e.target.value)}
          >
            <option value="">All</option>
            {FORM_CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version
          <input
            inputMode="numeric"
            value={filters.version}
            onChange={(e) => set('version', e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <label>
          Subject
          <select
            value={filters.subject}
            onChange={(e) => set('subject', e.target.value)}
          >
            <option value="">All</option>
            {Object.entries(SUBJECT_NAMES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => set('status', e.target.value)}
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="triaged">Triaged</option>
          </select>
        </label>
        <label>
          From
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(e) => set('from', e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(e) => set('to', e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.flagged === 'hide'}
            onChange={(e) => set('flagged', e.target.checked ? 'hide' : '')}
          />{' '}
          Hide flagged
        </label>
        <a className="secondary button" href={'/api/admin?' + csv} download>
          Export CSV
        </a>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.matched}
            {data.capped ? '+' : ''} responses match.
            {data.capped && ' Stats cover the newest 5,000.'}
          </p>
          {Object.entries(data.stats).length > 0 && (
            <div className="feedback-stats">
              {Object.entries(data.stats).map(([id, s]) => (
                <figure key={id}>
                  <figcaption>
                    {s.label} · <strong>{s.average.toFixed(2)}★</strong> ·{' '}
                    {s.count} ratings
                  </figcaption>
                  {s.distribution
                    .map((n, i) => ({ n, stars: i + 1 }))
                    .reverse()
                    .map(({ n, stars }) => (
                      <div key={stars} className="feedback-bar">
                        <span>{stars}★</span>
                        <span className="track">
                          <span
                            style={{
                              width: `${s.count ? (n / s.count) * 100 : 0}%`,
                            }}
                          />
                        </span>
                        <span>{n}</span>
                      </div>
                    ))}
                </figure>
              ))}
            </div>
          )}
          {data.responses.map((r) => (
            <details key={r.id} className="feedback-response">
              <summary>
                {new Date(r.created).toLocaleString()} · {r.context} v
                {r.version} · {subjectName(r.subject)} ·{' '}
                <span className={'badge ' + r.status}>{r.status}</span>
                {r.flagged ? ' · flagged' : ''}
              </summary>
              <dl>
                {Object.entries(r.answers).map(([id, a]) => {
                  const q = r.questions.find((x) => x.id === id);
                  return (
                    <div key={id}>
                      <dt>{q?.label ?? id}</dt>
                      <dd className="admin-plain">{answerText(q, a)}</dd>
                    </div>
                  );
                })}
                <div>
                  <dt>From</dt>
                  <dd>{r.account ? `account ${r.account}` : 'guest'}</dd>
                </div>
              </dl>
              {(r.client || r.game) && (
                <pre>
                  {JSON.stringify({ client: r.client, game: r.game }, null, 2)}
                </pre>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void triage(r)}
              >
                {r.status === 'new' ? 'Mark triaged' : 'Mark new'}
              </button>
            </details>
          ))}
          <div className="admin-actions">
            <button
              disabled={busy || offset === 0}
              onClick={() => void load(Math.max(0, offset - 50))}
            >
              Newer
            </button>
            <button
              disabled={busy || data.responses.length < 50}
              onClick={() => void load(offset + 50)}
            >
              Older
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Console home summary ----------

type Average = { subject: string; count: number; average: number };
export function FeedbackSummary({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<{
    responses: number;
    untriagedBugs: number;
    puzzles: Average[];
    scripts: Average[];
    storyteller: Average[];
  } | null>(null);
  useEffect(() => {
    void adminGet<NonNullable<typeof data>>('view=feedback-summary')
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  const list = (title: string, rows: Average[]) =>
    rows.length > 0 && (
      <div>
        <strong>{title}</strong>
        <ul>
          {rows.map((r) => (
            <li key={r.subject}>
              {subjectName(r.subject)}: {r.average.toFixed(2)}★ ({r.count})
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="panel feedback-summary" aria-label="Feedback this week">
      <div className="admin-actions">
        <h2>Feedback this week</h2>
        <button className="secondary" onClick={onOpen}>
          Open feedback
        </button>
      </div>
      <p>
        {data.responses} responses · <strong>{data.untriagedBugs}</strong>{' '}
        untriaged bug reports
      </p>
      <div className="feedback-summary-grid">
        {list('Puzzles', data.puzzles)}
        {list('Scripts (players)', data.scripts)}
        {list('Scripts (Storytellers)', data.storyteller)}
      </div>
    </section>
  );
}
