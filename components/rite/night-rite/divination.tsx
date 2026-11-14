'use client';
import { useState } from 'react';
import type { RitePuzzleView } from '@/lib/rite/view';
import { type ControlName, type RitualRule } from '@/lib/rite/types';
import {
  CONTROL_COUNTS,
  OFFERINGS,
  controlLabel,
  ritualRuleText,
} from '@/lib/rite/ritual';
import { SymbolArt, AltarArt } from '../art';
import { type Send } from './shell.tsx';
export function RitualRules({ rules = [] }: { rules?: RitualRule[] }) {
  if (!rules.length) return null;
  const controls = [
    ...new Set(
      rules.flatMap((rule) =>
        rule.source ? [rule.control, rule.source] : [rule.control],
      ),
    ),
  ];
  return (
    <section className="rite-rules" aria-label="Ritual instructions">
      <h3>After reading the omens</h3>
      <p>
        Decode all three starting settings from the book, then apply these
        instructions in order. Use each setting’s current value after any
        earlier instruction.
      </p>
      <ol>
        {rules.map((rule, index) => (
          <li key={index}>{ritualRuleText(rule)}</li>
        ))}
      </ol>
      <details>
        <summary>Numbered setting order</summary>
        {controls.map((control) => (
          <div key={control}>
            <h4>{control}</h4>
            <ol>
              {Array.from({ length: CONTROL_COUNTS[control] }, (_, value) => (
                <li key={value}>{controlLabel(control, value)}</li>
              ))}
            </ol>
          </div>
        ))}
      </details>
    </section>
  );
}
export function RitualControl({
  control,
  value,
  disabled,
  onChange,
}: {
  control: ControlName;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  if (control === 'candles')
    return (
      <>
        <AltarArt control={control} value={value} />
        <div className="rite-control-buttons">
          {['Red', 'White', 'Purple'].map((color, i) => (
            <button
              key={color}
              disabled={disabled}
              aria-pressed={!!(value & (1 << i))}
              onClick={() => onChange(value ^ (1 << i))}
            >
              {color} · {value & (1 << i) ? 'Lit' : 'Unlit'}
            </button>
          ))}
        </div>
      </>
    );
  if (control === 'offerings')
    return (
      <>
        <AltarArt control={control} value={value} />
        <div className="rite-control-buttons">
          {OFFERINGS[value].map((offering, slot) => (
            <label key={slot}>
              Slot {slot + 1}
              <select
                aria-label={`Offering slot ${slot + 1}`}
                disabled={disabled}
                value={offering}
                onChange={(e) => {
                  const next = [...OFFERINGS[value]],
                    other = next.indexOf(e.target.value);
                  [next[slot], next[other]] = [next[other], next[slot]];
                  onChange(
                    OFFERINGS.findIndex((p) =>
                      p.every((x, i) => x === next[i]),
                    ),
                  );
                }}
              >
                {['bone', 'feather', 'herb'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </>
    );
  if (control === 'chalice')
    return (
      <button
        className="rite-art-control"
        disabled={disabled}
        aria-label={`Chalice ${controlLabel(control, value)}. Tap to change level.`}
        onClick={() => onChange((value + 1) % 3)}
      >
        <AltarArt control={control} value={value} />
        <span>{controlLabel(control, value)} · Tap to change</span>
      </button>
    );
  return (
    <>
      <AltarArt control={control} value={value} />
      <div
        className={
          'rite-control-buttons ' + (control === 'dial' ? 'dial-marks' : '')
        }
      >
        {Array.from({ length: CONTROL_COUNTS[control] }, (_, v) => (
          <button
            key={v}
            disabled={disabled}
            aria-pressed={v === value}
            onClick={() => onChange(v)}
          >
            {controlLabel(control, v)}
          </button>
        ))}
      </div>
    </>
  );
}
export function Divination({
  puzzle,
  send,
  busy,
  name,
}: {
  puzzle: RitePuzzleView;
  send: Send;
  busy: boolean;
  name: (id: string) => string;
}) {
  const [tab, setTab] = useState('altar'),
    [page, setPage] = useState(0);
  const altar = puzzle.altar ?? [];
  return (
    <div
      className={
        'divination-puzzle ' + (puzzle.performed ? 'ritual-performed' : '')
      }
    >
      <div className="ritual-tabs" role="tablist" aria-label="Ritual pages">
        {['altar', 'omens', 'grimoire'].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t === 'altar'
              ? 'Your altar'
              : t === 'omens'
                ? `Omens · ${name(puzzle.omensFor ?? '')}`
                : `Grimoire · ${name(puzzle.keeperFor ?? '')}`}
          </button>
        ))}
      </div>
      {tab === 'altar' && (
        <>
          <p className="hint">
            Your omens: {name(puzzle.myOmensHolder ?? '')} · Your grimoire:{' '}
            {name(puzzle.myKeeper ?? '')}
          </p>
          <RitualRules rules={puzzle.rules} />
          {altar.map((a) => (
            <div className="altar-control" key={a.control}>
              <h3>{a.control === 'dial' ? 'Moon dial' : a.control}</h3>
              <RitualControl
                control={a.control}
                value={a.value}
                disabled={busy || puzzle.phase !== 'turn' || puzzle.performed}
                onChange={(value) =>
                  void send('riteRitualPick', {
                    altar: altar.map((x) =>
                      x.control === a.control ? { ...x, value } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
          <button
            className="primary full"
            disabled={busy || puzzle.phase !== 'turn' || puzzle.performed}
            onClick={() => void send('riteRitualPerform', { altar })}
          >
            {puzzle.performed
              ? 'The ritual is performed'
              : puzzle.usedTonight
                ? 'Sealed until the next night'
                : 'Perform the ritual'}
          </button>
          <p className="hint">
            One attempt per night, from night {puzzle.firstAttemptNight}.{' '}
            {puzzle.result === false
              ? 'The ritual falters. Nothing more is revealed.'
              : ''}
          </p>
        </>
      )}
      {tab === 'omens' && (
        <>
          <h3>For {name(puzzle.omensFor ?? '')}’s ritual</h3>
          {puzzle.omens?.map((set, i) => (
            <div className="omen-card" key={i}>
              <b>{['I', 'II', 'III'][i]}</b>
              {set.map((symbol) => (
                <SymbolArt key={symbol} symbol={symbol} />
              ))}
            </div>
          ))}
          <p className="hint">
            Read the symbols aloud. Order inside a set does not matter. Sets are
            not labeled.
          </p>
        </>
      )}
      {tab === 'grimoire' && (
        <>
          <h3>You keep this book for {name(puzzle.keeperFor ?? '')}</h3>
          <RitualRules rules={puzzle.keeperRules} />
          <div className="ritual-tabs">
            {puzzle.book?.map((p, i) => (
              <button
                key={p.control}
                aria-pressed={page === i}
                onClick={() => setPage(i)}
              >
                {p.control}
              </button>
            ))}
          </div>
          {puzzle.book?.[page]?.entries.map((e, i) => (
            <div className="grimoire-entry" key={i}>
              <div>
                {e.symbols.map((s) => (
                  <SymbolArt key={s} symbol={s} />
                ))}
              </div>
              <span>→</span>
              <div>
                <AltarArt
                  control={puzzle.book![page].control}
                  value={e.value}
                />
                <small>
                  {controlLabel(puzzle.book![page].control, e.value)}
                </small>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
