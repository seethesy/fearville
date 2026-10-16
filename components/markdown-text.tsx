'use client';
import { Fragment, type ReactNode } from 'react';
import { type Inline, parseMarkdown } from '@/lib/ui-text/markdown';
import { glossaryId } from '@/lib/ui-text/registry';
import { DefinitionTerm } from './glossary-text';

// FEAR-173: renders the safe markdown subset as React elements (no HTML).
function inline(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'br':
        return <br key={i} />;
      case 'b':
        return <strong key={i}>{inline(n.c)}</strong>;
      case 'i':
        return <em key={i}>{inline(n.c)}</em>;
      case 'link':
        return n.href.startsWith('/') ? (
          <a key={i} href={n.href}>
            {inline(n.c)}
          </a>
        ) : (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inline(n.c)}
          </a>
        );
      case 'term':
        return <DefinitionTerm key={i} text={n.text} termId={n.id} />;
    }
  });
}

/**
 * `inline` renders a single paragraph without a wrapping <p>, for places that
 * already sit inside a paragraph or heading.
 */
export function MarkdownText({
  text,
  inline: asInline,
}: {
  text: string;
  inline?: boolean;
}) {
  const blocks = parseMarkdown(text, glossaryId);
  if (asInline && blocks.length === 1 && blocks[0].t === 'p')
    return <>{inline(blocks[0].c)}</>;
  return (
    <>
      {blocks.map((b, i) =>
        b.t === 'p' ? (
          <p key={i}>{inline(b.c)}</p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
