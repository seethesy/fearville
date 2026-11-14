'use client';
/* Overflow regions need keyboard focus so their contents can be scrolled. */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
import { useId, useRef, useState, type CSSProperties } from 'react';
import type { Page } from '@/lib/rite/types';
import { controlLabel } from '@/lib/rite/ritual';
import { grimoireLabels, grimoireLayout } from '@/lib/rite/art-layout';
import { RITE_ART } from '@/lib/rite/art-assets';
import { PaintedArt } from '../art/painted';
import { SymbolArt, AltarArt } from '../art';

export function Grimoire({ book }: { book: Page[] }) {
  const [page, setPage] = useState(0);
  const reader = useRef<HTMLDivElement>(null),
    id = useId();
  const current = book[page] ?? book[0];
  if (!current) return null;
  const choose = (index: number) => {
    setPage(index);
    reader.current?.scrollTo(0, 0);
  };
  const title = current.control === 'dial' ? 'Moon dial' : current.control;
  const layout = grimoireLayout(320, current.control, current.entries.length);
  return (
    <div className="grimoire-shell">
      <div className="grimoire-heading">
        <PaintedArt
          art={RITE_ART.surfaces['grimoire/closed-cover']}
          className="grimoire-cover"
        />
        <div>
          <h3>The grimoire</h3>
          <p>Match all three symbols to a setting.</p>
        </div>
      </div>
      <div
        className="ritual-tabs grimoire-tabs"
        aria-label="Choose a grimoire page"
      >
        {book.map((entry, index) => (
          <button
            key={entry.control}
            aria-pressed={current.control === entry.control}
            aria-controls={id}
            onClick={() => choose(index)}
          >
            {entry.control === 'dial' ? 'Moon dial' : entry.control}
          </button>
        ))}
      </div>
      <section
        className="grimoire-reader"
        ref={reader}
        tabIndex={0}
        aria-label={`${title} grimoire page, scroll to read all entries`}
      >
        <article
          id={id}
          className={
            'grimoire-page ' +
            (current.entries.length <= 3 ? 'grimoire-page-short' : '')
          }
          style={
            {
              '--grimoire-narrow-row-height': layout.rowHeight + 'px',
            } as CSSProperties
          }
          aria-label={`${title}: ${current.entries.length} entries`}
        >
          <header className="grimoire-page-heading">
            <h4>{title}</h4>
            <span>Symbols → setting</span>
          </header>
          {current.entries.map((entry, index) => (
            <div className="grimoire-entry" key={index}>
              <div className="grimoire-symbols">
                {entry.symbols.map((symbol, i) => (
                  <SymbolArt key={i} symbol={symbol} />
                ))}
              </div>
              <span className="grimoire-arrow" aria-hidden="true">
                <span>↓</span>
                <span>→</span>
              </span>
              <div className="grimoire-setting">
                <AltarArt control={current.control} value={entry.value} />
                <small>
                  {grimoireLabels(
                    current.control,
                    controlLabel(current.control, entry.value),
                  ).map((line, i) => (
                    <span key={i}>{line}</span>
                  ))}
                </small>
              </div>
            </div>
          ))}
        </article>
      </section>
      <p className="grimoire-scroll-hint">
        Scroll the page to read all {current.entries.length} entries.
      </p>
      <div className="grimoire-pagination">
        <button onClick={() => choose((page + book.length - 1) % book.length)}>
          Previous page
        </button>
        <button onClick={() => choose((page + 1) % book.length)}>
          Next page
        </button>
      </div>
    </div>
  );
}
