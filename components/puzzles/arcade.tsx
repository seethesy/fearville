'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HubShell } from '@/components/hub/shell';
import { PATTERNS, type Pattern } from '@/lib/rite/types';
import type { StandalonePuzzle } from '@/lib/rite/puzzle';
import { PuzzlePlayer, type PuzzleResult } from './player';

type Difficulty = StandalonePuzzle['difficulty'];
type Progress = { solved: string[]; unassisted: string[] };
const LEVELS: Difficulty[] = ['easy', 'standard', 'hard'];
const LEVEL_NAMES: Record<Difficulty, string> = {
  easy: 'Easy',
  standard: 'Standard',
  hard: 'Hard',
};
const DESCRIPTIONS: Record<Pattern, { mark: string; text: string }> = {
  board: {
    mark: '↗',
    text: 'Untangle the town. Plan a route through shifting obstacles.',
  },
  grid: {
    mark: '✧',
    text: 'Follow the clues. Connect people, places, and hidden routines.',
  },
  ritual: {
    mark: '☽',
    text: 'Read the omens. Decode a grimoire and bring the altar to life.',
  },
  lab: {
    mark: '⚗',
    text: 'Find order in the mixture. Separate each mysterious substance.',
  },
};
const STORAGE_KEY = 'fearville-puzzles-progress-v1';
const identity = (puzzle: StandalonePuzzle) =>
  `${puzzle.pattern}:${puzzle.difficulty}:${puzzle.revision}:${puzzle.seed}`;
const newSeed = () => `night-${crypto.randomUUID().slice(0, 12)}`;
const puzzleUrl = (puzzle: StandalonePuzzle) => {
  const url = new URL('/puzzles', window.location.origin);
  url.search = new URLSearchParams({
    pattern: puzzle.pattern,
    difficulty: puzzle.difficulty,
    seed: puzzle.seed,
    revision: String(puzzle.revision),
  }).toString();
  return url;
};

export function PuzzleArcade() {
  const [pattern, setPattern] = useState<Pattern>('board');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [seed, setSeed] = useState('');
  const [revision, setRevision] = useState<number | undefined>();
  const [puzzle, setPuzzle] = useState<StandalonePuzzle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completed, setCompleted] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [progress, setProgress] = useState<Progress>({
    solved: [],
    unassisted: [],
  });
  const request = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const generate = useCallback(
    async (
      kind: Pattern,
      level: Difficulty,
      requestedSeed: string,
      requestedRevision?: number,
    ) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      setError('');
      setNotice('');
      try {
        const response = await fetch('/api/puzzles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pattern: kind,
            difficulty: level,
            seed: requestedSeed.trim() || newSeed(),
            ...(requestedRevision === undefined
              ? {}
              : { revision: requestedRevision }),
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          puzzle?: StandalonePuzzle;
          error?: string;
        };
        if (!response.ok || !data.puzzle)
          throw new Error(
            data.error ||
              'The puzzle could not be generated. Please try another seed.',
          );
        if (controller.signal.aborted) return;
        const next = data.puzzle;
        setPuzzle(next);
        setPattern(next.pattern);
        setDifficulty(next.difficulty);
        setSeed(next.seed);
        setRevision(next.revision);
        setCompleted(false);
        setPlayKey((current) => current + 1);
        window.history.replaceState(null, '', puzzleUrl(next));
        requestAnimationFrame(() => resultHeading.current?.focus());
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : 'The puzzle could not be loaded. Please try again.',
          );
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    const initialize = setTimeout(() => {
      try {
        const saved: unknown = JSON.parse(
          localStorage.getItem(STORAGE_KEY) || 'null',
        );
        if (
          saved &&
          typeof saved === 'object' &&
          'solved' in saved &&
          'unassisted' in saved &&
          Array.isArray(saved.solved) &&
          Array.isArray(saved.unassisted)
        ) {
          setProgress({
            solved: saved.solved
              .filter((value): value is string => typeof value === 'string')
              .slice(-2000),
            unassisted: saved.unassisted
              .filter((value): value is string => typeof value === 'string')
              .slice(-2000),
          });
        }
      } catch {
        /* Private browsing may disable device storage. Puzzles still work. */
      }
      const query = new URLSearchParams(window.location.search);
      const kind = query.get('pattern');
      const level = query.get('difficulty');
      const requestedSeed = query.get('seed');
      const requestedRevision = query.has('revision')
        ? Number(query.get('revision'))
        : undefined;
      const selectedPattern: Pattern =
        kind && Object.hasOwn(PATTERNS, kind) ? (kind as Pattern) : 'board';
      const selectedLevel: Difficulty = LEVELS.includes(level as Difficulty)
        ? (level as Difficulty)
        : 'easy';
      setPattern(selectedPattern);
      setDifficulty(selectedLevel);
      if (requestedSeed?.trim())
        void generate(
          selectedPattern,
          selectedLevel,
          requestedSeed,
          requestedRevision !== undefined &&
            Number.isSafeInteger(requestedRevision) &&
            requestedRevision >= 0
            ? requestedRevision
            : undefined,
        );
    }, 0);
    return () => {
      clearTimeout(initialize);
      request.current?.abort();
    };
  }, [generate]);
  const recordCompletion = (result: PuzzleResult) => {
    if (!puzzle) return;
    const id = identity(puzzle);
    const next = {
      solved: progress.solved.includes(id)
        ? progress.solved
        : [...progress.solved, id].slice(-2000),
      unassisted:
        result.hints || progress.unassisted.includes(id)
          ? progress.unassisted
          : [...progress.unassisted, id].slice(-2000),
    };
    setProgress(next);
    setCompleted(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setNotice('Completion saved on this device.');
    } catch {
      setNotice('Puzzle completed. This browser could not save your progress.');
    }
  };
  const count = (kind: Pattern, level: Difficulty) =>
    progress.solved.filter((id) => id.startsWith(`${kind}:${level}:`)).length;
  return (
    <HubShell
      active="Play"
      title="The Puzzle Room"
      subtitle="Four mysteries. Your own pace. Follow a clue, find a path, and take on the next challenge."
    >
      <div className="puzzle-arcade">
        <section className="puzzle-intro" aria-label="Puzzle room introduction">
          <div>
            <p className="eyebrow">FEARVILLE · SOLO PUZZLES</p>
            <h2>A little mystery, whenever you like.</h2>
            <p>
              Play without a table or a timer. Begin with Easy, build your
              instincts, and move up when you are ready. Every puzzle can be
              reset and replayed.
            </p>
          </div>
          <div className="puzzle-total">
            <strong>{progress.solved.length}</strong>
            <span>puzzles solved</span>
            <small>{progress.unassisted.length} without hints</small>
          </div>
        </section>
        <form
          className="puzzle-setup"
          onSubmit={(event) => {
            event.preventDefault();
            void generate(pattern, difficulty, seed, revision);
          }}
        >
          <fieldset className="puzzle-selection-grid" disabled={busy}>
            <legend>Choose your puzzle</legend>
            {(Object.keys(PATTERNS) as Pattern[]).map((kind) => (
              <label
                className={`puzzle-choice ${pattern === kind ? 'puzzle-choice-selected' : ''}`}
                key={kind}
              >
                <input
                  type="radio"
                  name="puzzle-pattern"
                  value={kind}
                  checked={pattern === kind}
                  onChange={() => {
                    setPattern(kind);
                    setRevision(undefined);
                  }}
                />
                <span className="puzzle-mark" aria-hidden="true">
                  {DESCRIPTIONS[kind].mark}
                </span>
                <strong>{PATTERNS[kind]}</strong>
                <span>{DESCRIPTIONS[kind].text}</span>
                <small>
                  {LEVELS.map(
                    (level) => `${LEVEL_NAMES[level]} ${count(kind, level)}`,
                  ).join(' · ')}
                </small>
              </label>
            ))}
          </fieldset>
          <div className="puzzle-options">
            <label>
              Difficulty
              <select
                disabled={busy}
                value={difficulty}
                onChange={(event) => {
                  setDifficulty(event.target.value as Difficulty);
                  setRevision(undefined);
                }}
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_NAMES[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="puzzle-seed">
              Replay seed <span className="muted">(optional)</span>
              <input
                disabled={busy}
                value={seed}
                maxLength={80}
                autoComplete="off"
                placeholder="Leave blank for a surprise"
                onChange={(event) => {
                  setSeed(event.target.value);
                  setRevision(undefined);
                }}
              />
            </label>
            <button className="primary" disabled={busy} type="submit">
              {busy
                ? 'Creating your puzzle…'
                : puzzle
                  ? 'Play this seed'
                  : 'Start puzzle'}
            </button>
            {puzzle && (
              <button
                className="secondary"
                disabled={busy}
                type="button"
                onClick={() => void generate(pattern, difficulty, '')}
              >
                New puzzle
              </button>
            )}
          </div>
          <p className="hint">
            {difficulty === 'easy'
              ? 'Learn the rules through shorter routes and clearer deductions.'
              : difficulty === 'standard'
                ? 'More interlocking decisions, with room to plan and experiment.'
                : 'Longer plans, layered clues, and more intricate transformations.'}
          </p>
        </form>
        <div aria-live="polite" aria-atomic="true">
          {busy && (
            <p className="puzzle-feedback">
              Finding a solvable puzzle for your chosen difficulty…
            </p>
          )}
          {error && <p className="rite-error">{error}</p>}
        </div>
        {puzzle && (
          <section
            className="night-rite puzzle-play-area"
            aria-label="Current puzzle"
            aria-busy={busy}
          >
            <header className="puzzle-play-heading">
              <div>
                <p className="eyebrow">
                  {LEVEL_NAMES[puzzle.difficulty]} · SOLO CHALLENGE
                </p>
                <h2 ref={resultHeading} tabIndex={-1}>
                  {PATTERNS[puzzle.pattern]}
                </h2>
                <p className="puzzle-seed-note">
                  Seed <code>{puzzle.seed}</code> · Edition {puzzle.revision}
                </p>
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      puzzleUrl(puzzle).toString(),
                    );
                    setNotice(
                      'Replay link copied. It includes the seed, difficulty, and edition.',
                    );
                  } catch {
                    setNotice('Copy this page’s address to share the puzzle.');
                  }
                }}
              >
                Copy replay link
              </button>
            </header>
            <PuzzlePlayer
              key={playKey}
              puzzle={puzzle}
              onComplete={recordCompletion}
            />
            {completed && (
              <div className="puzzle-next">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void generate(puzzle.pattern, puzzle.difficulty, '')
                  }
                >
                  Another {LEVEL_NAMES[puzzle.difficulty].toLowerCase()} puzzle
                </button>
                {puzzle.difficulty !== 'hard' && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void generate(
                        puzzle.pattern,
                        LEVELS[LEVELS.indexOf(puzzle.difficulty) + 1],
                        '',
                      )
                    }
                  >
                    Try{' '}
                    {LEVEL_NAMES[LEVELS[LEVELS.indexOf(puzzle.difficulty) + 1]]}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
        <output className="puzzle-storage-note">
          {notice ||
            'Your completion history stays in this browser. Save a replay link to return to any puzzle.'}
        </output>
      </div>
    </HubShell>
  );
}
