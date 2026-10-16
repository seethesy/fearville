'use client';
import { useId, useState } from 'react';
import type { Answer, FormDefinition, Question } from '@/lib/feedback/forms';
import { LIMITS } from '@/lib/feedback/forms';
import { StarRating } from './stars';

// FEAR-174: draws any feedback form definition. Never asks for a typed number.
// FEAR-175 uses `preview` to show the admin what players will see.
export function FeedbackForm({
  form,
  onSubmit,
  compact,
  preview,
  submitLabel = 'Send',
}: {
  form: FormDefinition;
  onSubmit?: (answers: Record<string, Answer>) => Promise<void>;
  compact?: boolean;
  preview?: boolean;
  submitLabel?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (id: string, value: Answer) =>
    setAnswers((a) => ({ ...a, [id]: value }));
  // Compact prompts lead with the stars and reveal the rest after a tap.
  const firstStars = form.questions.findIndex((q) => q.type === 'stars');
  const expanded =
    !compact ||
    firstStars < 0 ||
    answers[form.questions[firstStars].id] !== undefined;
  const shown = expanded ? form.questions : [form.questions[firstStars]];
  const missing = form.questions.find((q) => {
    const a = answers[q.id];
    return (
      q.required &&
      (a === undefined ||
        (typeof a === 'string' && !a.trim()) ||
        (Array.isArray(a) && !a.length))
    );
  });
  async function submit() {
    if (preview || !onSubmit) return;
    if (missing) {
      setError(`Answer “${missing.label}”.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const clean = Object.fromEntries(
        Object.entries(answers).filter(
          ([, a]) =>
            !(typeof a === 'string' && !a.trim()) &&
            !(Array.isArray(a) && !a.length),
        ),
      );
      await onSubmit(clean);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={'feedback-form' + (compact ? ' compact' : '')}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {!compact && form.intro && <p className="muted">{form.intro}</p>}
      {shown.map((q) => (
        <Field
          key={q.id}
          question={q}
          value={answers[q.id]}
          onChange={(v) => set(q.id, v)}
          disabled={busy}
        />
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {expanded && (
        <button
          className="primary"
          disabled={busy || preview}
          title={preview ? 'Preview only' : undefined}
        >
          {busy ? 'Sending…' : submitLabel}
        </button>
      )}
    </form>
  );
}

function Field({
  question: q,
  value,
  onChange,
  disabled,
}: {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer) => void;
  disabled: boolean;
}) {
  const id = useId();
  const label = (
    <span className="feedback-label" id={id}>
      {q.label}
      {q.required ? (
        <span className="feedback-required" aria-label="required">
          {' '}
          *
        </span>
      ) : null}
    </span>
  );
  switch (q.type) {
    case 'stars':
      return (
        <div className="feedback-field">
          {label}
          <StarRating
            label={q.label}
            value={typeof value === 'number' ? value : 0}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      );
    case 'single':
    case 'multi': {
      const chosen =
        q.type === 'multi'
          ? Array.isArray(value)
            ? value
            : []
          : typeof value === 'string'
            ? [value]
            : [];
      return (
        <div
          className="feedback-field"
          role={q.type === 'single' ? 'radiogroup' : 'group'}
          aria-labelledby={id}
        >
          {label}
          <div className="feedback-chips">
            {q.options!.map((o) => {
              const on = chosen.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role={q.type === 'single' ? 'radio' : 'checkbox'}
                  aria-checked={on}
                  className={'chip' + (on ? ' on' : '')}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      q.type === 'single'
                        ? on
                          ? ''
                          : o.id
                        : on
                          ? chosen.filter((x) => x !== o.id)
                          : [...chosen, o.id],
                    )
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case 'short':
      return (
        <label className="feedback-field">
          {label}
          <input
            value={typeof value === 'string' ? value : ''}
            maxLength={LIMITS.short}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    case 'long':
      return (
        <label className="feedback-field">
          {label}
          <textarea
            rows={3}
            value={typeof value === 'string' ? value : ''}
            maxLength={LIMITS.long}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
