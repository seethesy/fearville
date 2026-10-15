import { TUTORIALS } from '../tutorials/content.ts';
import { GLOSSARY } from '../game/glossary.ts';
import { ALL_ROLES } from '../game/types/roles.ts';
import { ROLE_TIPS } from '../game/role-tips.ts';
// FEAR-173: content catalogs are exposed as editable keys. The catalogs stay
// the bundled defaults; an edit only changes what is displayed (the engine
// keeps using ids), so e.g. ability text can be reworded safely.
const tutorialText: Record<string, string> = {};
for (const t of TUTORIALS) {
  tutorialText['tutorial.' + t.id + '.title'] = t.title;
  tutorialText['tutorial.' + t.id + '.summary'] = t.summary;
  t.steps.forEach((step, i) => {
    for (const field of ['title', 'body'] as const) {
      tutorialText[`tutorial.${t.id}.${i}.${field}`] = step[field];
      if (step.ios?.[field])
        tutorialText[`tutorial.${t.id}.${i}.ios.${field}`] = step.ios[field]!;
    }
  });
}
const glossaryText: Record<string, string> = {};
for (const g of GLOSSARY) {
  glossaryText[`glossary.${g.id}.term`] = g.term;
  glossaryText[`glossary.${g.id}.definition`] = g.definition;
  if (g.example) glossaryText[`glossary.${g.id}.example`] = g.example;
}
const roleText: Record<string, string> = {};
for (const r of ALL_ROLES) {
  roleText[`role.${r.id}.name`] = r.name;
  roleText[`role.${r.id}.ability`] = r.description;
}
for (const [script, roles] of Object.entries(ROLE_TIPS))
  for (const [roleId, tips] of Object.entries(roles))
    tips.forEach((tip, i) => (roleText[`tips.${script}.${roleId}.${i}`] = tip));
// Stable keys serve browsers and mobile shells. Keep legacy native keys for
// saved text versions and older clients; never reuse a retired key.
export const UI_TEXT: Record<string, string> = {
  ...tutorialText,
  ...glossaryText,
  ...roleText,
  'home.welcome': 'Welcome to Fearville.',
  'home.webTagline':
    'A game of hidden roles, tall tales, and suspicious friends.',
  'home.tagline': 'Hidden roles. Tall tales. Suspicious friends.',
  'home.choose': 'Choose your game.',
  'home.subtitle': 'Gather the town. The night is yours.',
  'home.join': 'Join game',
  'home.create': 'Create a lobby',
  'home.sandbox': 'Open sandbox',
  'home.guest': 'Continue as guest',
  'home.custom': 'Custom',
  'home.soon': 'Coming soon',
  'lobby.name': 'Lobby name',
  'lobby.code': 'Session code',
  'lobby.codeHint': 'Enter the 6-digit code from your Storyteller.',
  'lobby.tab': 'Lobby',
  'lobby.players': '{count} players',
  'flow.tab': 'Game flow',
  'flow.nativeTab': 'Game',
  'nav.play': 'Play',
  'nav.social': 'Social',
  'nav.rules': 'Rules',
  'nav.account': 'Account',
  'footer.tagline': 'Keep your secrets. Find your people.',
} satisfies Record<string, string>;
export type TextKey = keyof typeof UI_TEXT;
export function textDefault(key: string): string {
  if (!Object.hasOwn(UI_TEXT, key)) throw Error('Unknown text key.');
  return UI_TEXT[key as TextKey];
}
export function placeholders(text: string) {
  return [...new Set(text.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? [])].sort();
}
export function validateText(key: string, value: unknown): string {
  const fallback = textDefault(key);
  if (typeof value !== 'string' || !value.trim() || value.length > 4000)
    throw Error('Text must contain 1–4000 characters.');
  if (
    JSON.stringify(placeholders(value)) !==
    JSON.stringify(placeholders(fallback))
  )
    throw Error(
      'Preserve all named placeholders exactly; do not add new ones.',
    );
  if (textFormat(key) === 'markdown') validateMarkdown(value);
  // Rendered as React text: plain keys verbatim, markdown keys through the
  // small safe renderer in components/markdown-text.tsx. Never raw HTML.
  return value;
}

/** Long content is markdown (links, glossary links, lists); labels are plain. */
export function textFormat(key: string): 'markdown' | 'plain' {
  return /^tutorial\..+\.(body|summary)$|^glossary\..+\.(definition|example)$|^tips\./.test(
    key,
  )
    ? 'markdown'
    : 'plain';
}

// Markdown links may point at the web (https), this app (/path) or a glossary
// term ([[Fear]] or [text](glossary:fear)). Anything else is refused.
const LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g;
export function validateMarkdown(value: string) {
  for (const [, , href] of value.matchAll(LINK))
    if (!/^(https:\/\/|http:\/\/|\/(?!\/)|glossary:[a-z0-9-]+$)/.test(href))
      throw Error('Links must start with https://, / or glossary:.');
  for (const [, term] of value.matchAll(/\[\[([^\]]+)\]\]/g))
    if (!glossaryId(term)) throw Error(`“${term}” is not a glossary term.`);
}

/** Glossary id for a term name or id, case-insensitive. */
export function glossaryId(term: string) {
  const t = term.trim().toLowerCase();
  return GLOSSARY.find((g) => g.id === t || g.term.toLowerCase() === t)?.id;
}

/** Where a key belongs, for grouping in the editor. */
export function textGroup(key: string) {
  const head = key.split('.')[0];
  return (
    {
      tutorial: 'Tutorials and guides',
      glossary: 'Glossary',
      role: 'Characters',
      tips: 'Role tips',
    }[head] ?? 'Interface'
  );
}
export function formatText(
  value: string,
  values: Record<string, string | number> = {},
) {
  return value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
