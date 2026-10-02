'use client';
import { useEffect, useState } from 'react';
import {
  maxLevels,
  puzzleNames,
  settings,
  type PuzzleKind,
} from '@/lib/puzzles/config';
import { createPuzzle, input, type PuzzleState } from '@/lib/puzzles/session';
import { getCategory } from '@/lib/puzzles/words';

function PuzzleBoard({
  state,
  change,
}: {
  state: PuzzleState;
  change: (next: PuzzleState) => void;
}) {
  const [beat, setBeat] = useState(-1);
  const p = state.content;
  useEffect(() => {
    if (state.status !== 'preview') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (ms: number) =>
      timers.push(
        setTimeout(() => change(input(state, { type: 'ready' })), ms),
      );
    if (p.kind === 'tiles') finish(p.previewMs);
    if (p.kind === 'rhythm') {
      p.sequence.forEach((_, i) => {
        timers.push(setTimeout(() => setBeat(i), i * p.beatMs));
        timers.push(
          setTimeout(
            () => setBeat(-1),
            (i + settings.beatOnFraction) * p.beatMs,
          ),
        );
      });
      finish(p.sequence.length * p.beatMs);
    }
    return () => timers.forEach(clearTimeout);
  }, [state, p, change]);
  const answer = (value: string | number) =>
    change(input(state, { type: 'answer', value }));
  const ended = state.status === 'success' || state.status === 'failure';
  const disabled = state.status !== 'playing';
  return (
    <div className="puzzle-board">
      <output aria-live="polite">
        {ended
          ? state.status === 'success'
            ? 'Puzzle complete!'
            : 'Round over. Try again!'
          : state.status === 'preview'
            ? 'Watch carefully…'
            : 'Your turn.'}
      </output>
      {p.kind === 'tiles' && (
        <>
          <p>
            Remember {p.highlighted.length} tiles. Find them all before{' '}
            {settings.mistakes} mistakes.
          </p>
          <div
            className="puzzle-tiles"
            style={{ gridTemplateColumns: `repeat(${p.grid}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: p.grid * p.grid }, (_, i) => {
              const selected = state.selected.includes(i),
                lit =
                  (state.status === 'preview' || ended || selected) &&
                  p.highlighted.includes(i);
              return (
                <button
                  key={i}
                  className={`puzzle-tile ${lit ? 'lit' : ''} ${selected && !lit ? 'miss' : ''}`}
                  disabled={disabled || selected}
                  onClick={() => answer(i)}
                  aria-label={`Tile ${i + 1}${lit ? ', highlighted' : ''}`}
                  aria-pressed={selected}
                >
                  {lit ? '◆' : selected ? '×' : '·'}
                </button>
              );
            })}
          </div>
          <p>
            {state.correct}/{p.highlighted.length} found · {state.mistakes}/
            {settings.mistakes} mistakes
          </p>
        </>
      )}
      {p.kind === 'words' && (
        <>
          <p>Has this word appeared earlier in this round?</p>
          <div className="puzzle-prompt">
            {ended ? 'Round finished' : p.sequence[state.cursor]}
          </div>
          <div className="puzzle-actions">
            {['NEW', 'SEEN'].map((v) => (
              <button
                className="secondary"
                disabled={disabled}
                key={v}
                onClick={() => answer(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <p>
            Word {Math.min(state.cursor + 1, p.sequence.length)}/
            {p.sequence.length} · {state.correct} correct · {state.mistakes}/
            {settings.mistakes} strikes
          </p>
        </>
      )}
      {p.kind === 'odd' && (
        <>
          <p>
            Which word does not belong to “{getCategory(p.category).displayName}
            ”?
          </p>
          <div className="puzzle-actions">
            {p.options.map((v) => (
              <button
                className="secondary"
                disabled={disabled}
                key={v}
                onClick={() => answer(v)}
              >
                {v}
              </button>
            ))}
          </div>
          {ended && (
            <p>
              {p.answer} belongs to {getCategory(p.otherCategory).displayName}.
            </p>
          )}
        </>
      )}
      {p.kind === 'rhythm' && (
        <>
          <p>
            Watch the flashes, then repeat their order. No audio or precise
            tapping speed needed.
          </p>
          <div className="puzzle-actions">
            {p.inputs.map((v) => (
              <button
                className={`secondary ${state.status === 'preview' && p.sequence[beat] === v ? 'puzzle-flash' : ''}`}
                disabled={disabled}
                key={v}
                onClick={() => answer(v)}
              >
                {v}
                {state.status === 'preview' && p.sequence[beat] === v
                  ? ' ●'
                  : ''}
              </button>
            ))}
          </div>
          <p>
            {state.status === 'preview'
              ? 'Playing sequence'
              : `${state.entered.length}/${p.sequence.length} inputs entered`}
          </p>
          {ended && <p>Sequence: {p.sequence.join(' → ')}</p>}
        </>
      )}
      {p.kind === 'sorting' && (
        <>
          <p>
            Choose the category. A mistake leaves the item in place so you can
            retry.
          </p>
          <div className="puzzle-prompt">
            {ended ? 'Round finished' : p.items[state.cursor].word}
          </div>
          <div className="puzzle-actions">
            {p.categories.map((id) => (
              <button
                className="secondary"
                disabled={disabled}
                key={id}
                onClick={() => answer(id)}
              >
                {getCategory(id).displayName}
              </button>
            ))}
          </div>
          <p>
            {state.cursor}/{p.items.length} sorted · {state.mistakes}/
            {settings.mistakes} mistakes
          </p>
        </>
      )}
      {p.kind === 'pattern' && (
        <>
          <p>What comes next?</p>
          <div className="puzzle-prompt">{p.sequence.join(' · ')} · ?</div>
          <div className="puzzle-actions">
            {p.options.map((v) => (
              <button
                className="secondary"
                disabled={disabled}
                key={v}
                onClick={() => answer(v)}
              >
                {v}
              </button>
            ))}
          </div>
          {ended && (
            <p>
              {p.rule} Next: {p.answer}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function NightPuzzles() {
  const [kind, setKind] = useState<PuzzleKind>('tiles');
  const [level, setLevel] = useState(1);
  const [state, setState] = useState<PuzzleState | null>(null);
  const [run, setRun] = useState(0);
  const [error, setError] = useState('');
  function begin(nextLevel = level, replay = false) {
    try {
      setState(
        createPuzzle(kind).start(nextLevel, replay ? state?.seed : undefined),
      );
      setLevel(nextLevel);
      setRun((n) => n + 1);
      setError('');
    } catch {
      setError('This puzzle could not start. Try another round.');
    }
  }
  return (
    <section className="night-puzzles" aria-label="Night puzzles">
      <p className="eyebrow">WHILE THE TOWN SLEEPS</p>
      <h3>Night puzzles</h3>
      <p className="muted">
        Just for fun, for every player. Your night choice and Storyteller
        messages come first. Puzzles never delay dawn or change abilities.
      </p>
      <div className="puzzle-controls">
        <label className="field">
          Puzzle
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as PuzzleKind);
              setLevel(1);
              setState(null);
            }}
          >
            {Object.entries(puzzleNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {maxLevels[kind] > 1 && (
          <label className="field">
            Level
            <select
              value={level}
              onChange={(e) => {
                setLevel(Number(e.target.value));
                setState(null);
              }}
            >
              {Array.from({ length: maxLevels[kind] }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="primary" onClick={() => begin()}>
          {state ? 'New round' : 'Start puzzle'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {state && (
        <>
          <PuzzleBoard key={run} state={state} change={setState} />
          <div className="puzzle-actions">
            <button className="secondary" onClick={() => begin(level, true)}>
              Restart same puzzle
            </button>
            {state.status === 'success' && level < maxLevels[kind] && (
              <button className="primary" onClick={() => begin(level + 1)}>
                Next level
              </button>
            )}
            <button className="secondary" onClick={() => setState(null)}>
              Close puzzle
            </button>
          </div>
        </>
      )}
    </section>
  );
}
