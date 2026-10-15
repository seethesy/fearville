'use client';
import { useState } from 'react';
import { CircleHelp, Play } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { helpSections } from '@/lib/tutorials/engine';
import { useTutorials } from './provider';
import { RoleTipsToggle } from '@/components/role-tips';
import { KeepAwakeToggle } from '@/components/keep-awake-toggle';
import {
  FeedbackButtons,
  FeedbackDialog,
  type HelpContext,
} from '@/components/feedback/dialog';

// FEAR-20: replay any tutorial or guide on demand. Lists only what applies
// to this viewer: the player walkthrough for seated players, the Storyteller
// tour for hosts, and only the player's own Night Rite guide.
export function HelpMenu({
  host,
  seated,
  ownGuides = [],
  className = 'secondary help-button',
  label = 'Help',
  tipSession,
  code,
}: {
  host: boolean;
  seated: boolean;
  ownGuides?: string[];
  className?: string;
  label?: string;
  tipSession?: string;
  /** Table code, so bug reports attach the public game phase. */
  code?: string;
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<HelpContext | null>(null);
  const { state, replay, blocked, account } = useTutorials();
  const sections = helpSections({
    platform: 'web',
    host,
    seated,
    ownGuides,
    seen: state.seen,
  });
  return (
    <>
      <button
        type="button"
        className={className}
        data-tutorial="help-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <CircleHelp aria-hidden="true" size={16} />
        <span>{label}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="help-dialog">
          <DialogHeader>
            <DialogTitle>Help & tutorials</DialogTitle>
            <DialogDescription>
              Replay any tour or guide. Skip at any step.
              {blocked
                ? ' A timed step is in progress, so your choice starts when it ends.'
                : ''}
            </DialogDescription>
          </DialogHeader>
          {sections.map((section) => (
            <section key={section.title} className="help-section">
              <p className="eyebrow">{section.title.toUpperCase()}</p>
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span className="muted">{item.summary}</span>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`${item.seen ? 'Replay' : 'Start'} ${item.title}`}
                      onClick={() => {
                        setOpen(false);
                        replay(item.id);
                      }}
                    >
                      <Play aria-hidden="true" size={14} />
                      {item.seen ? 'Replay' : 'Start'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {account && (
            <p className="hint">
              Want every tutorial to pop up again? Use Show tutorials again in
              Account → Settings.
            </p>
          )}
          {tipSession && (
            <section className="help-section">
              <p className="eyebrow">ROLE TIPS</p>
              <RoleTipsToggle session={tipSession} />
            </section>
          )}
          {tipSession && (
            <section className="help-section">
              <p className="eyebrow">SCREEN</p>
              <KeepAwakeToggle />
            </section>
          )}
          <section className="help-section">
            <p className="eyebrow">FEEDBACK</p>
            <FeedbackButtons
              onChoose={(c) => {
                setOpen(false);
                setFeedback(c);
              }}
            />
          </section>
        </DialogContent>
      </Dialog>
      <FeedbackDialog
        context={feedback}
        code={code}
        open={feedback !== null}
        onOpenChange={(o) => !o && setFeedback(null)}
      />
    </>
  );
}

// Account settings (FEAR-20 optional): forget every seen tutorial.
export function ResetTutorials() {
  const { account, reset } = useTutorials();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  if (!account) return null;
  return (
    <section className="panel tutorial-settings">
      <p className="eyebrow">TUTORIALS</p>
      <h2>Show tutorials again.</h2>
      <p className="muted">
        Each tutorial shows once per account, on every device. Reset to see the
        walkthrough and every section tutorial again from the start.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await reset();
            setMessage('Tutorials will show again.');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Reset failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Show tutorials again
      </button>
      {message && <output className="hint">{message}</output>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
