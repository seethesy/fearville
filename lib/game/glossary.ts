// Key game terms, shared by the web rules reference and role descriptions.
// Browsers and mobile shells consume these definitions through the shared web UI.
export type GlossaryTerm = {
  id: string;
  term: string;
  definition: string;
  example?: string;
};

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'fear',
    term: 'Fear',
    definition:
      'A feared player’s ability malfunctions, exactly as if they were poisoned or drunk. They are not told. They still wake and make choices, but their ability has no effect and anything they learn may be false. Fear lasts only as long as the ability that caused it says.',
  },
  {
    id: 'visit',
    term: 'Visit',
    definition:
      'When a player with a night ability chooses another player, they visit that player, unless the ability says otherwise. A feared player still visits. If a visit is redirected, it lands on the new player instead.',
  },
  {
    id: 'save',
    term: 'Save',
    definition:
      'A saved player cannot die that night. A save stops every attempt to kill that player that night, even several at once. Saves only work at night, and players can never save themselves.',
  },
  {
    id: 'learn',
    term: 'Learn',
    definition:
      'The Storyteller privately tells you information that players cannot normally access. This is the main ability of information roles. If you are feared, poisoned or drunk, what you learn may be false.',
  },
  {
    id: 'declare',
    term: 'Declare',
    definition:
      'An official public statement made during the day. If you are asked to declare at night, wait until morning to make your declaration.',
    example: '“I am the Vigilante and I declare that I want to kill Player A.”',
  },
  {
    id: 'neighbor',
    term: 'Neighbor',
    definition:
      'A player sitting directly next to you; everyone has two. Neighbors include both living and dead players unless an ability says otherwise, for example “living neighbors”.',
  },
];

export const glossaryTerm = (id: string) => GLOSSARY.find((t) => t.id === id);

// Word forms that link to a glossary entry inside role descriptions.
export const GLOSSARY_FORMS: Record<string, string> = {
  fear: 'fear',
  feared: 'fear',
  fears: 'fear',
  visit: 'visit',
  visits: 'visit',
  visited: 'visit',
  visiting: 'visit',
  save: 'save',
  saved: 'save',
  saves: 'save',
  learn: 'learn',
  learns: 'learn',
  declare: 'declare',
  declares: 'declare',
  declared: 'declare',
  declaration: 'declare',
  neighbor: 'neighbor',
  neighbors: 'neighbor',
};

// Splits text into plain strings and glossary links, so role descriptions can
// point at the definition of each key term.
export function glossarySegments(
  text: string,
  excludeId?: string,
): (string | { text: string; id: string })[] {
  const out: (string | { text: string; id: string })[] = [];
  const seen = new Set(excludeId ? [excludeId] : []);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(${Object.keys(GLOSSARY_FORMS)
      .sort((a, b) => b.length - a.length)
      .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})(?![\\p{L}\\p{N}_])`,
    'giu',
  );
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const id = GLOSSARY_FORMS[match[0].toLowerCase()];
    if (seen.has(id) || !glossaryTerm(id)) continue;
    seen.add(id);
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ text: match[0], id });
    last = at + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
