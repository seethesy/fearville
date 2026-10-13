'use client';
import { UiText } from '@/components/ui-text';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { Tutorial, TutorialStep } from '@/lib/tutorials/types';
import { TutorialIllustration } from './illustration';
import { RiteDiagramArt } from './rite-diagram';

// Step overlay with a spotlight on the step's target (`data-tutorial`).
// Modal: focus is trapped in the card, the page behind cannot be used, and
// Escape asks whether to skip. Missing targets show a centered card.

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
const PAD = 6;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const all = document.querySelectorAll<HTMLElement>(
    `[data-tutorial="${CSS.escape(name)}"]`,
  );
  // First visible match (tabs keep hidden panels mounted).
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export function TutorialOverlay({
  tutorial,
  steps,
  index,
  onNext,
  onBack,
  onSkip,
}: {
  tutorial: Tutorial;
  steps: TutorialStep[];
  index: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const card = useRef<HTMLDialogElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const titleId = useId(),
    bodyId = useId();

  // Restore focus to where it was when the tutorial ends.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);

  // Measure the target; follow scrolling and resizing.
  useLayoutEffect(() => {
    const el = findTarget(step.target);
    if (el)
      el.scrollIntoView({
        block: 'center',
        behavior: reducedMotion() ? 'auto' : 'smooth',
      });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = findTarget(step.target);
        if (!current) return setRect(null);
        const r = current.getBoundingClientRect();
        setRect({
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
        });
      });
    };
    measure();
    // Smooth scrolling settles over a few frames.
    const settle = setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    primary.current?.focus();
  }, [index]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setConfirmSkip((v) => !v);
      return;
    }
    if (e.key !== 'Tab' || !card.current) return;
    const focusable = Array.from(
      card.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0],
      end = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      end.focus();
    } else if (!e.shiftKey && document.activeElement === end) {
      e.preventDefault();
      first.focus();
    }
  }

  // Keep the card away from the spotlight: top half target → card below.
  const viewport = typeof window === 'undefined' ? 800 : window.innerHeight;
  const placement = !rect
    ? 'center'
    : rect.top + rect.height / 2 > viewport / 2
      ? 'top'
      : 'bottom';

  return (
    <div className="tutorial-layer">
      {/* Catches clicks so the page stays inert during the tutorial. */}
      <div
        className={rect ? 'tutorial-catcher' : 'tutorial-catcher dim'}
        aria-hidden="true"
      />
      {rect && (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
      <dialog
        open
        ref={card}
        className={`tutorial-card tutorial-${placement}`}
        onKeyDown={onKeyDown}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <div className="tutorial-meta">
          <span className="eyebrow" style={{textTransform:'uppercase'}}>{tutorial.kind==='walkthrough'?<UiText id={'tutorial.'+tutorial.id+'.title'}/>:tutorial.title.toUpperCase()}</span>
          <span className="tutorial-count">
            Step {index + 1} of {steps.length}
          </span>
        </div>
        {step.diagram ? (
          <RiteDiagramArt name={step.diagram} />
        ) : (
          step.illustration && <TutorialIllustration name={step.illustration} />
        )}
        <div aria-live="polite">
          <h2 id={titleId}>{tutorial.kind==='walkthrough'?<UiText id={`tutorial.${tutorial.id}.${tutorial.steps.indexOf(step)}.title`}/>:step.title}</h2>
          <p id={bodyId}>{tutorial.kind==='walkthrough'?<UiText id={`tutorial.${tutorial.id}.${tutorial.steps.indexOf(step)}.body`}/>:step.body}</p>
        </div>
        <div
          className="tutorial-progress"
          aria-hidden="true"
          style={{ ['--steps' as string]: steps.length }}
        >
          {steps.map((_, i) => (
            <span key={i} className={i <= index ? 'done' : ''} />
          ))}
        </div>
        {confirmSkip ? (
          <div className="tutorial-confirm">
            <p>Skip this tutorial? You can replay it from Help.</p>
            <div className="tutorial-actions">
              <button
                className="secondary"
                onClick={() => {
                  setConfirmSkip(false);
                  primary.current?.focus();
                }}
              >
                Keep going
              </button>
              <button className="primary" onClick={onSkip} autoFocus>
                Skip tutorial
              </button>
            </div>
          </div>
        ) : (
          <div className="tutorial-actions">
            <button className="text-action tutorial-skip" onClick={onSkip}>
              Skip
            </button>
            <button
              className="secondary"
              onClick={onBack}
              disabled={index === 0}
            >
              Back
            </button>
            <button ref={primary} className="primary" onClick={onNext}>
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
