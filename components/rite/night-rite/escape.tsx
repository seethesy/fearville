'use client';
import { useRef, useState } from 'react';
import type { RitePuzzleView } from '@/lib/rite/view';
import { Wreckage } from '../art';
import { type Send } from './shell.tsx';
export function Escape({
  puzzle,
  send,
  busy,
  solo = false,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
  solo?: boolean;
}) {
  const [selected, setSelected] = useState('');
  const board = useRef<HTMLDivElement>(null),
    drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const blocks = puzzle.blocks ?? [],
    active = puzzle.phase === 'turn' && !busy;
  const move = (id: string, x: number, y: number) => {
    if (active)
      void send('riteBoardMove', { block: id, x, y, turn: puzzle.turn });
  };
  return (
    <div className="escape-puzzle">
      <div className="escape-board" ref={board}>
        <div className="escape-gate" aria-hidden="true">
          ✦ ❯❯
        </div>
        {blocks.map((b) => (
          <button
            key={b.id}
            className={'escape-piece ' + (selected === b.id ? 'selected' : '')}
            aria-label={`${b.key ? 'Red carriage' : b.kind}, ${b.horiz ? 'horizontal' : 'vertical'}, column ${b.x + 1}, row ${b.y + 1}`}
            aria-pressed={selected === b.id}
            style={{
              left: `${(b.x / 6) * 100}%`,
              top: `${(b.y / 6) * 100}%`,
              width: `${((b.horiz ? b.len : 1) / 6) * 100}%`,
              height: `${((b.horiz ? 1 : b.len) / 6) * 100}%`,
            }}
            onClick={() => setSelected(b.id)}
            onPointerDown={(e) => {
              setSelected(b.id);
              drag.current = { id: b.id, x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (!d || !board.current) return;
              const cell = board.current.clientWidth / 6,
                dx = Math.round((e.clientX - d.x) / cell),
                dy = Math.round((e.clientY - d.y) / cell);
              if (dx || dy) move(b.id, b.x + dx, b.y + dy);
            }}
            onKeyDown={(e) => {
              const delta = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[e.key];
              if (delta) {
                e.preventDefault();
                move(b.id, b.x + delta[0], b.y + delta[1]);
              }
            }}
          >
            <Wreckage block={b} />
          </button>
        ))}
      </div>
      <p className="hint">
        Slide a piece along its length. Get the red carriage through the gate.
        Tap a piece and use the arrows, or drag.
      </p>
      {selected && (
        <div className="rite-buttons">
          {[
            [-1, 0, '←'],
            [1, 0, '→'],
            [0, -1, '↑'],
            [0, 1, '↓'],
          ].map(([dx, dy, label]) => (
            <button
              className="secondary"
              key={label}
              aria-label={`Move selected piece ${label}`}
              disabled={!active}
              onClick={() => {
                const b = blocks.find((b) => b.id === selected);
                if (b) move(b.id, b.x + Number(dx), b.y + Number(dy));
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {active && !solo && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void send('ritePass', { turn: puzzle.turn })}
        >
          Pass
        </button>
      )}
    </div>
  );
}
