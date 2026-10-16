'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { type PromptContext, decidePrompt } from '@/lib/feedback/client';
import { useTutorials } from '@/components/tutorials/provider';
import { FeedbackForm } from './form';
import {
  type LoadedForm,
  browserStore,
  flushOutbox,
  loadForm,
  sendFeedback,
} from './api';

// FEAR-174: a small, dismissible rating card shown inline on a result screen.
// Shown to a random sample (lib/feedback/client.ts PROMPT_RULES), never
// blocks play, and waits while a tutorial blocker (timed step) is active.
export function InlineFeedback({
  context,
  subject,
  occasion,
  respectBlockers = true,
}: {
  context: PromptContext;
  subject?: string;
  /** Stable id for this chance to rate, e.g. a recap or puzzle epoch. */
  occasion: string;
  respectBlockers?: boolean;
}) {
  const { blocked } = useTutorials();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<LoadedForm | null>(null);
  const [done, setDone] = useState<'' | 'sent' | 'queued' | 'dismissed'>('');
  useEffect(() => {
    let live = true;
    const frame = requestAnimationFrame(() => {
      if (
        !decidePrompt(context, occasion, browserStore(), Date.now(), () =>
          Math.random(),
        )
      )
        return;
      setShow(true);
      void loadForm(context)
        .then((f) => live && setForm(f))
        .catch(() => {
          /* No prompt when the form cannot load. */
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [context, occasion]);
  useEffect(() => {
    void flushOutbox();
    const retry = () => void flushOutbox();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);
  if (!show || !form || done === 'dismissed') return null;
  if (respectBlockers && blocked && !done) return null;
  return (
    <aside className="feedback-inline" aria-label={form.title}>
      <div className="feedback-inline-head">
        <p className="eyebrow">{form.title.toUpperCase()}</p>
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss"
          onClick={() => setDone('dismissed')}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      {done ? (
        <output className="hint">
          {done === 'sent'
            ? 'Thank you! Your rating helps shape Fearville.'
            : 'Thanks! You’re offline, so we’ll send this when you reconnect.'}
        </output>
      ) : (
        <FeedbackForm
          form={form}
          compact
          onSubmit={async (answers) =>
            setDone(await sendFeedback(form, answers, { subject }))
          }
        />
      )}
    </aside>
  );
}
