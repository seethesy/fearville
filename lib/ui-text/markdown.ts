// FEAR-173: a deliberately small markdown subset for editable long content.
// Parsed into plain data; components/markdown-text.tsx renders it as React
// elements, so nothing is ever injected as HTML.
//
//   Paragraphs separated by a blank line; single newlines are line breaks.
//   "- item" or "* item" lines form a list.
//   **bold**, *italic*, [text](https://… or /path), [[Glossary term]],
//   [text](glossary:term-id).

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'term'; id: string; text: string };
export type Block = { t: 'p'; c: Inline[] } | { t: 'ul'; items: Inline[][] };

const TOKEN =
  /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)\s]+)\)|\n/g;

export function parseInline(
  text: string,
  glossaryId: (term: string) => string | undefined,
): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[0] === '\n') out.push({ t: 'br' });
    else if (m[1] !== undefined)
      out.push({ t: 'b', c: parseInline(m[1], glossaryId) });
    else if (m[2] !== undefined)
      out.push({ t: 'i', c: parseInline(m[2], glossaryId) });
    else if (m[3] !== undefined) {
      const id = glossaryId(m[3]);
      out.push(id ? { t: 'term', id, text: m[3] } : { t: 'text', v: m[3] });
    } else {
      const href = m[5];
      const label = m[4];
      if (href.startsWith('glossary:'))
        out.push({ t: 'term', id: href.slice(9), text: label });
      else if (/^(https?:\/\/|\/(?!\/))/.test(href))
        out.push({ t: 'link', href, c: parseInline(label, glossaryId) });
      else out.push({ t: 'text', v: label }); // unsafe link: keep the words
    }
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

export function parseMarkdown(
  text: string,
  glossaryId: (term: string) => string | undefined,
): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
      blocks.push({
        t: 'ul',
        items: lines.map((l) =>
          parseInline(l.replace(/^\s*[-*]\s+/, ''), glossaryId),
        ),
      });
    else blocks.push({ t: 'p', c: parseInline(lines.join('\n'), glossaryId) });
  }
  return blocks;
}
