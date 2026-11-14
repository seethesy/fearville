'use client';

import { useRef, useState } from 'react';
import type { Altar, Block, Triple, Vial } from '@/lib/rite/types';
import type { StandalonePuzzle } from '@/lib/rite/puzzle';
import { CHARACTERS, LOCATIONS, ACTIVITIES } from '@/lib/rite/grid/vocabulary';
import {
  CONTROL_COUNTS,
  controlLabel,
  ritualRuleText,
} from '@/lib/rite/ritual';
import { Wreckage, VialArt, SymbolArt, PlaceArt } from '@/components/rite/art';
import { RitualControl } from '@/components/rite/night-rite/divination';

export function EscapePuzzle({
  blocks,
  disabled,
  onMove,
}: {
  blocks: Block[];
  disabled: boolean;
  onMove: (block: string, x: number, y: number) => void;
}) {
  const [selected, setSelected] = useState('key');
  const [distance, setDistance] = useState(1);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const piece = blocks.find((block) => block.id === selected);
  const move = (block: Block, delta: number) =>
    onMove(
      block.id,
      block.x + (block.horiz ? delta : 0),
      block.y + (block.horiz ? 0 : delta),
    );
  return (
    <div className="escape-puzzle">
      <p className="hint">
        Clear a path for the red carriage to the gate. Pieces slide along their
        length. Drag a piece, or select it and use the direction buttons or
        arrow keys.
      </p>
      <div className="escape-board" ref={board}>
        <div className="escape-gate" aria-hidden="true">
          ✦ ❯❯
        </div>
        {blocks.map((block) => (
          <button
            key={block.id}
            className={`escape-piece ${selected === block.id ? 'selected' : ''}`}
            disabled={disabled}
            aria-label={`${block.key ? 'Red carriage' : block.kind}, ${block.id}, ${block.horiz ? 'horizontal' : 'vertical'}, column ${block.x + 1}, row ${block.y + 1}`}
            aria-pressed={selected === block.id}
            style={{
              left: `${(block.x / 6) * 100}%`,
              top: `${(block.y / 6) * 100}%`,
              width: `${((block.horiz ? block.len : 1) / 6) * 100}%`,
              height: `${((block.horiz ? 1 : block.len) / 6) * 100}%`,
            }}
            onClick={() => setSelected(block.id)}
            onPointerDown={(event) => {
              setSelected(block.id);
              drag.current = {
                id: block.id,
                x: event.clientX,
                y: event.clientY,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerUp={(event) => {
              const start = drag.current;
              drag.current = null;
              if (!start || start.id !== block.id || !board.current) return;
              const distance = block.horiz
                ? event.clientX - start.x
                : event.clientY - start.y;
              const delta = Math.round(
                distance / (board.current.clientWidth / 6),
              );
              if (delta) move(block, delta);
            }}
            onKeyDown={(event) => {
              const arrows = block.horiz
                ? ['ArrowLeft', 'ArrowRight']
                : ['ArrowUp', 'ArrowDown'];
              const direction = arrows.indexOf(event.key);
              if (direction < 0) return;
              event.preventDefault();
              move(block, direction ? 1 : -1);
            }}
          >
            <Wreckage block={block} />
          </button>
        ))}
      </div>
      <div className="puzzle-move-pad">
        <span>
          {piece
            ? `${piece.key ? 'Red carriage' : piece.kind} · ${piece.id}`
            : 'Select a piece'}
        </span>
        <label>
          Slide distance
          <select
            value={Math.min(distance, 6 - (piece?.len ?? 2))}
            disabled={disabled || !piece}
            onChange={(event) => setDistance(Number(event.target.value))}
          >
            {Array.from({ length: 6 - (piece?.len ?? 2) }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1} {index ? 'spaces' : 'space'}
              </option>
            ))}
          </select>
        </label>
        {[0, 1].map((direction) => (
          <button
            key={direction}
            className="secondary"
            disabled={!piece || disabled}
            onClick={() =>
              piece &&
              move(
                piece,
                (direction ? 1 : -1) * Math.min(distance, 6 - piece.len),
              )
            }
            aria-label={`Move selected piece ${piece?.horiz ? (direction ? 'right' : 'left') : direction ? 'down' : 'up'}`}
          >
            {piece?.horiz
              ? direction
                ? 'Right →'
                : '← Left'
              : direction
                ? 'Down ↓'
                : '↑ Up'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LaboratoryPuzzle({
  vials,
  disabled,
  onPour,
}: {
  vials: Vial[];
  disabled: boolean;
  onPour: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState('');
  return (
    <div className="lab-puzzle">
      <p className="hint">
        Separate the liquids until every vial contains only one substance or is
        empty. Select a source, then a destination. Pour onto the same substance
        or into an empty vial; each holds four units.
      </p>
      <div className="lab-shelves">
        {vials.map((vial, index) => (
          <button
            className={`vial ${from === vial.id ? 'selected' : ''}`}
            key={vial.id}
            disabled={disabled}
            aria-pressed={from === vial.id}
            aria-label={`Vial ${index + 1}${from === vial.id ? ', selected source' : ''}: ${vial.layers.length ? `${vial.layers.length} units, bottom to top: ${vial.layers.map((color) => ['green eyes', 'red bubbles', 'blue stars', 'purple smoke', 'yellow lightning', 'teal fish', 'pink spirals', 'ink runes', 'orange leaves', 'silver crosses'][color]).join(', ')}` : 'empty'}`}
            onClick={() => {
              if (from && from !== vial.id) {
                onPour(from, vial.id);
                setFrom('');
              } else setFrom(from === vial.id ? '' : vial.id);
            }}
          >
            <VialArt vial={vial} selected={from === vial.id} />
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <output className="puzzle-selection">
        {from
          ? `Vial ${vials.findIndex((vial) => vial.id === from) + 1} selected. Choose where to pour.`
          : 'Choose a vial to begin a pour.'}
      </output>
    </div>
  );
}

export function SphinxPuzzle({
  puzzle,
  placements,
  disabled,
  onChange,
  onCheck,
}: {
  puzzle: NonNullable<StandalonePuzzle['grid']>;
  placements: Triple[];
  disabled: boolean;
  onChange: (next: Triple[]) => void;
  onCheck: () => void;
}) {
  const [marked, setMarked] = useState<string[]>([]);
  const place = (
    location: number,
    kind: 'character' | 'activity',
    value: number,
  ) => {
    onChange(
      placements.map((row) =>
        row.location === location
          ? { ...row, [kind]: value }
          : value >= 0 && row[kind] === value
            ? { ...row, [kind]: -1 }
            : row,
      ),
    );
  };
  return (
    <div className="sphinx-puzzle">
      <p className="hint">
        Use every character and activity exactly once. Places run west to east
        below. Every clue is truthful; together they identify one solution. Mark
        a clue when you have used it.
      </p>
      <div
        className="puzzle-street"
        aria-label="Places ordered from west to east"
      >
        {LOCATIONS.map((name, location) => {
          const row = placements.find(
            (placement) => placement.location === location,
          )!;
          return (
            <div className="puzzle-place" key={name}>
              <PlaceArt place={location} />
              <h3>
                <span>{location + 1}</span> {name}
              </h3>
              <label>
                Character
                <select
                  disabled={disabled}
                  value={row.character}
                  onChange={(event) =>
                    place(location, 'character', Number(event.target.value))
                  }
                >
                  <option value={-1}>Choose character</option>
                  {CHARACTERS.map((character, index) => (
                    <option key={character} value={index}>
                      {character}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Activity
                <select
                  disabled={disabled}
                  value={row.activity}
                  onChange={(event) =>
                    place(location, 'activity', Number(event.target.value))
                  }
                >
                  <option value={-1}>Choose activity</option>
                  {ACTIVITIES.map((activity, index) => (
                    <option key={activity} value={index}>
                      {activity}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
      <p className="hint">
        ← West / East → · Moving an assigned character or activity clears its
        previous place.
      </p>
      <button
        className="primary"
        disabled={
          disabled ||
          placements.some((row) => row.character < 0 || row.activity < 0)
        }
        onClick={onCheck}
      >
        Check solution
      </button>
      <div className="rite-clues">
        <h3>The Sphinx’s clues</h3>
        {puzzle.clues.map((clue, index) => (
          <label
            className={`puzzle-clue ${marked.includes(clue.id) ? 'puzzle-clue-marked' : ''}`}
            key={clue.id}
          >
            <input
              type="checkbox"
              checked={marked.includes(clue.id)}
              onChange={() =>
                setMarked((current) =>
                  current.includes(clue.id)
                    ? current.filter((id) => id !== clue.id)
                    : [...current, clue.id],
                )
              }
            />
            <span>
              <b>{index + 1}.</b> {clue.text}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function DivinationPuzzle({
  puzzle,
  altar,
  disabled,
  onChange,
  onCheck,
}: {
  puzzle: NonNullable<StandalonePuzzle['ritual']>;
  altar: Altar;
  disabled: boolean;
  onChange: (next: Altar) => void;
  onCheck: () => void;
}) {
  const [page, setPage] = useState(0);
  const current = puzzle.book[page];
  return (
    <div className="divination-puzzle puzzle-divination">
      <p className="hint">
        Match each omen’s symbols with an entry in the grimoire to discover its
        control and starting setting. Symbol order does not matter. Then apply
        any inscription rules in order and set the altar.
      </p>
      <section aria-label="Omens">
        <h3>The omens</h3>
        <div className="puzzle-omens">
          {puzzle.omens.map((omen, index) => (
            <div className="omen-card" key={index}>
              <b>{index + 1}</b>
              {omen.map((symbol) => (
                <SymbolArt key={symbol} symbol={symbol} />
              ))}
            </div>
          ))}
        </div>
      </section>
      {!!puzzle.rules?.length && (
        <section className="puzzle-inscription">
          <h3>The inscription</h3>
          <ol>
            {puzzle.rules.map((rule, index) => (
              <li key={index}>{ritualRuleText(rule)}</li>
            ))}
          </ol>
          <details>
            <summary>Setting order for the inscription</summary>
            {altar.map(({ control }) => (
              <p key={control}>
                <strong>{control}:</strong>{' '}
                {Array.from(
                  { length: CONTROL_COUNTS[control] },
                  (_, value) => `${value + 1}. ${controlLabel(control, value)}`,
                ).join(' → ')}
              </p>
            ))}
          </details>
        </section>
      )}
      <section className="puzzle-grimoire" aria-label="Grimoire">
        <h3>The grimoire</h3>
        <div className="ritual-tabs" aria-label="Choose a grimoire page">
          {puzzle.book.map((entry, index) => (
            <button
              aria-pressed={page === index}
              key={entry.control}
              onClick={() => setPage(index)}
            >
              {entry.control === 'dial' ? 'Moon dial' : entry.control}
            </button>
          ))}
        </div>
        {current && (
          <div className="puzzle-book-entries">
            {current.entries.map((entry, index) => (
              <div className="puzzle-book-entry" key={index}>
                <div>
                  {entry.symbols.map((symbol) => (
                    <SymbolArt key={symbol} symbol={symbol} />
                  ))}
                </div>
                <span>{controlLabel(current.control, entry.value)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section aria-label="Your altar">
        <h3>Your altar</h3>
        <div className="puzzle-altar">
          {altar.map((entry) => (
            <div className="altar-control" key={entry.control}>
              <h4>{entry.control === 'dial' ? 'Moon dial' : entry.control}</h4>
              <RitualControl
                control={entry.control}
                value={entry.value}
                disabled={disabled}
                onChange={(value) =>
                  onChange(
                    altar.map((item) =>
                      item.control === entry.control
                        ? { ...item, value }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
        <button className="primary" disabled={disabled} onClick={onCheck}>
          Perform the ritual
        </button>
      </section>
    </div>
  );
}
