'use client';
import { useEffect, useState } from 'react';
import { Bug, MessageSquare } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FeedbackForm } from './form';
import {
  type LoadedForm,
  flushOutbox,
  loadForm,
  sendFeedback,
} from './api';

export type HelpContext = 'general' | 'bug';

// FEAR-174: "Send feedback" and "Report a problem" from the Help menu.
export function FeedbackDialog({
  context,
  code,
  open,
  onOpenChange,
}: {
  context: HelpContext | null;
  code?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState<LoadedForm | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [done, setDone] = useState<'' | 'sent' | 'queued'>('');
  useEffect(() => {
    if (!open || !context) return;
    let live = true;
    void flushOutbox();
    void loadForm(context)
      .then((f) => live && setForm(f))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
      setForm(undefined);
      setError('');
      setDone('');
    };
  }, [open, context]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="feedback-dialog">
        <DialogHeader>
          <DialogTitle>
            {form?.title ??
              (context === 'bug' ? 'Report a problem' : 'Send feedback')}
          </DialogTitle>
          <DialogDescription>
            {context === 'bug'
              ? 'We attach your app and connection details and, at a table, the public game phase. Never your role, notes or messages.'
              : 'Tell us what you think. Every message is read.'}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="feedback-thanks">
            <output>
              {done === 'sent'
                ? 'Thank you! We got it.'
                : 'You’re offline. We saved it and will send it when you reconnect.'}
            </output>
            <button className="primary" onClick={() => onOpenChange(false)}>
              Close
            </button>
          </div>
        ) : form ? (
          <FeedbackForm
            form={form}
            onSubmit={async (answers) =>
              setDone(
                await sendFeedback(
                  form,
                  answers,
                  context === 'bug' && code ? { code } : {},
                ),
              )
            }
          />
        ) : form === null ? (
          <p className="muted">This form is not available right now.</p>
        ) : error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Two buttons that open the feedback and bug forms. */
// With `onChoose` the caller owns the dialog (e.g. the Help menu closes its
// own dialog first); without it these buttons open their own.
export function FeedbackButtons({
  code,
  onChoose,
}: {
  code?: string;
  onChoose?: (context: HelpContext) => void;
}) {
  const [own, setContext] = useState<HelpContext | null>(null);
  const choose = (c: HelpContext) => (onChoose ? onChoose(c) : setContext(c));
  return (
    <>
      <div className="feedback-buttons">
        <button
          type="button"
          className="secondary"
          onClick={() => choose('general')}
        >
          <MessageSquare aria-hidden="true" size={14} /> Send feedback
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => choose('bug')}
        >
          <Bug aria-hidden="true" size={14} /> Report a problem
        </button>
      </div>
      {!onChoose && (
        <FeedbackDialog
          context={own}
          code={code}
          open={own !== null}
          onOpenChange={(o) => !o && setContext(null)}
        />
      )}
    </>
  );
}
