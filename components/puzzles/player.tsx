'use client';

import { useState } from 'react';
import type { Altar, Block, Triple, Vial } from '@/lib/rite/types';
import type { StandalonePuzzle } from '@/lib/rite/puzzle';
import { boardSolved, slide, solveBoard } from '@/lib/rite/board';
import { labSolved, pour, solveLab } from '@/lib/rite/lab';
import { CHARACTERS, LOCATIONS, ACTIVITIES } from '@/lib/rite/grid/vocabulary';
import { controlLabel } from '@/lib/rite/ritual';
import {
  EscapePuzzle,
  LaboratoryPuzzle,
  SphinxPuzzle,
  DivinationPuzzle,
} from './controls';

type Position = {
  blocks: Block[];
  vials: Vial[];
  placements: Triple[];
  altar: Altar;
};
export type PuzzleResult = { moves: number; checks: number; hints: number };
const startPosition = (puzzle: StandalonePuzzle): Position => ({
  blocks: structuredClone(puzzle.board?.blocks ?? []),
  vials: structuredClone(puzzle.lab?.vials ?? []),
  placements: Array.from({ length: 5 }, (_, location) => ({
    location,
    character: -1,
    activity: -1,
  })),
  altar: structuredClone(puzzle.ritual?.altar ?? []),
});

export function PuzzlePlayer({
  puzzle,
  onComplete,
}: {
  puzzle: StandalonePuzzle;
  onComplete?: (result: PuzzleResult) => void;
}) {
  return (
    <PuzzleSession
      key={`${puzzle.pattern}:${puzzle.difficulty}:${puzzle.revision}:${puzzle.seed}`}
      puzzle={puzzle}
      onComplete={onComplete}
    />
  );
}

function PuzzleSession({
  puzzle,
  onComplete,
}: {
  puzzle: StandalonePuzzle;
  onComplete?: (result: PuzzleResult) => void;
}) {
  const [position, setPosition] = useState(() => startPosition(puzzle));
  const [history, setHistory] = useState<Position[]>([]);
  const [moves, setMoves] = useState(0);
  const [checks, setChecks] = useState(0);
  const [hints, setHints] = useState(0);
  const [solved, setSolved] = useState(false);
  const [notice, setNotice] = useState('');
  const [hint, setHint] = useState('');
  const [reset, setReset] = useState(0);
  const par = puzzle.board?.par ?? puzzle.lab?.par;
  const complete = (result: PuzzleResult) => {
    setSolved(true);
    setNotice('Puzzle complete. Well played.');
    setHint('');
    onComplete?.(result);
  };
  const change = (next: Position) => {
    if (solved) return;
    setHistory((current) => [...current.slice(-499), position]);
    setPosition(next);
    setMoves(moves + 1);
    setNotice('');
    setHint('');
    if (
      (puzzle.pattern === 'board' && boardSolved(next.blocks)) ||
      (puzzle.pattern === 'lab' && labSolved(next.vials))
    )
      complete({ moves: moves + 1, checks, hints });
  };
  const check = () => {
    const correct = puzzle.grid
      ? puzzle.grid.solution.every((answer) =>
          position.placements.some(
            (row) =>
              row.location === answer.location &&
              row.character === answer.character &&
              row.activity === answer.activity,
          ),
        )
      : puzzle.ritual?.target.every((answer) =>
          position.altar.some(
            (entry) =>
              entry.control === answer.control && entry.value === answer.value,
          ),
        );
    setChecks(checks + 1);
    if (correct) complete({ moves, checks: checks + 1, hints });
    else
      setNotice(
        puzzle.grid
          ? 'The solution is not consistent with all the clues yet. Revisit your deductions and try again.'
          : 'The ritual falters. Check each omen and apply the inscription in order.',
      );
  };
  const requestHint = () => {
    let text = '';
    // Hint searches have a small wall-clock budget so a difficult position
    // cannot freeze a phone. Generation itself happens on the server.
    if (puzzle.board) {
      const path = solveBoard(position.blocks, 40000, performance.now() + 100);
      const move = path?.[0];
      if (move) {
        const block = position.blocks.find((entry) => entry.id === move.block)!;
        text = `Move ${block.key ? 'the red carriage' : `the ${block.kind} (${block.id})`} ${block.horiz ? `from column ${block.x + 1} to column ${move.x + 1}` : `from row ${block.y + 1} to row ${move.y + 1}`}. A slide of several spaces counts as one move.`;
      } else {
        setNotice(
          'A hint could not be found within the search limit. Try clearing the carriage’s row, or undo a recent move.',
        );
        return;
      }
    } else if (puzzle.lab) {
      const path = solveLab(position.vials, 25000, performance.now() + 100);
      const move = path?.[0];
      if (move)
        text = `Pour vial ${position.vials.findIndex((vial) => vial.id === move.from) + 1} into vial ${position.vials.findIndex((vial) => vial.id === move.to) + 1}. This is the next step on a solution path.`;
      else {
        setNotice(
          path === null
            ? 'This arrangement has no solution. Undo a pour or reset to the original puzzle.'
            : 'A hint could not be found within the search limit. Try combining matching top layers, or undo a recent pour.',
        );
        return;
      }
    } else if (puzzle.grid) {
      const answer = puzzle.grid.solution.find((solution) =>
        position.placements.some(
          (row) =>
            row.location === solution.location &&
            (row.character !== solution.character ||
              row.activity !== solution.activity),
        ),
      );
      if (answer) {
        const row = position.placements.find(
          (entry) => entry.location === answer.location,
        )!;
        text =
          row.character !== answer.character
            ? `One deduction to build on: the ${CHARACTERS[answer.character]} belongs at the ${LOCATIONS[answer.location]}. Find the clues that connect them.`
            : `One deduction to build on: ${ACTIVITIES[answer.activity]} takes place at the ${LOCATIONS[answer.location]}. Trace its connections through the clues.`;
      } else {
        setNotice(
          'Every placement is consistent. Check your solution to finish.',
        );
        return;
      }
    } else if (puzzle.ritual) {
      const answer = puzzle.ritual.target.find((target) =>
        position.altar.some(
          (entry) =>
            entry.control === target.control && entry.value !== target.value,
        ),
      );
      if (answer)
        text = `The final ${answer.control === 'dial' ? 'moon dial' : answer.control} setting is ${controlLabel(answer.control, answer.value)}. Match its omen to the grimoire, then trace any rules that change it.`;
      else {
        setNotice('The altar is ready. Perform the ritual to finish.');
        return;
      }
    }
    setHint(text);
    setHints(hints + 1);
    setNotice('');
  };
  return (
    <div className={`puzzle-player ${solved ? 'puzzle-player-complete' : ''}`}>
      <dl className="puzzle-metrics">
        <div>
          <dt>{puzzle.grid || puzzle.ritual ? 'Changes' : 'Moves'}</dt>
          <dd>{moves}</dd>
        </div>
        {par !== undefined && (
          <div>
            <dt>Optimal moves</dt>
            <dd>{par}</dd>
          </div>
        )}
        {(puzzle.grid || puzzle.ritual) && (
          <div>
            <dt>Checks</dt>
            <dd>{checks}</dd>
          </div>
        )}
        <div>
          <dt>Hints</dt>
          <dd>{hints}</dd>
        </div>
        {puzzle.grid && (
          <div>
            <dt>Placed</dt>
            <dd>
              {position.placements.reduce(
                (total, row) =>
                  total +
                  Number(row.character >= 0) +
                  Number(row.activity >= 0),
                0,
              )}{' '}
              / 10
            </dd>
          </div>
        )}
      </dl>
      {puzzle.board && (
        <EscapePuzzle
          key={reset}
          blocks={position.blocks}
          disabled={solved}
          onMove={(block, x, y) => {
            const blocks = slide(position.blocks, { block, x, y });
            if (blocks) change({ ...position, blocks });
            else
              setNotice(
                'That slide is blocked. Pieces must stay on the board and cannot pass through each other.',
              );
          }}
        />
      )}
      {puzzle.lab && (
        <LaboratoryPuzzle
          key={reset}
          vials={position.vials}
          disabled={solved}
          onPour={(from, to) => {
            const vials = pour(position.vials, { from, to });
            if (vials) change({ ...position, vials });
            else
              setNotice(
                'That pour is not possible. Use an empty vial or a matching top substance with room remaining.',
              );
          }}
        />
      )}
      {puzzle.grid && (
        <SphinxPuzzle
          key={reset}
          puzzle={puzzle.grid}
          placements={position.placements}
          disabled={solved}
          onChange={(placements) => change({ ...position, placements })}
          onCheck={check}
        />
      )}
      {puzzle.ritual && (
        <DivinationPuzzle
          key={reset}
          puzzle={puzzle.ritual}
          altar={position.altar}
          disabled={solved}
          onChange={(altar) => change({ ...position, altar })}
          onCheck={check}
        />
      )}
      <div className="puzzle-tools">
        <button
          className="secondary"
          disabled={solved || !history.length}
          onClick={() => {
            setPosition(history[history.length - 1]);
            setHistory(history.slice(0, -1));
            setNotice('Last change undone.');
            setHint('');
          }}
        >
          Undo
        </button>
        <button
          className="secondary"
          onClick={() => {
            setPosition(startPosition(puzzle));
            setHistory([]);
            setMoves(0);
            setChecks(0);
            setSolved(false);
            setHint('');
            setNotice(
              'Original puzzle restored. Hints remain counted for this attempt.',
            );
            setReset(reset + 1);
          }}
        >
          Reset puzzle
        </button>
        <button className="secondary" disabled={solved} onClick={requestHint}>
          Reveal a hint
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {notice && (
          <p className={solved ? 'puzzle-success' : 'puzzle-feedback'}>
            {notice}
          </p>
        )}
        {hint && (
          <p className="puzzle-hint">
            <strong>Hint {hints}:</strong> {hint}
          </p>
        )}
      </div>
      {solved && (
        <div className="puzzle-finish">
          <h3>{hints ? 'The mystery is solved.' : 'Solved without hints.'}</h3>
          <p>
            {par !== undefined
              ? `${moves} moves · ${par} optimal${moves === par ? ' · A perfect route.' : ''}`
              : `${checks} ${checks === 1 ? 'check' : 'checks'} · ${moves} ${moves === 1 ? 'change' : 'changes'}`}{' '}
            · {hints} {hints === 1 ? 'hint' : 'hints'}
          </p>
        </div>
      )}
    </div>
  );
}
