import { TUTORIALS } from '../tutorials/content.ts';
const tutorialText: Record<string, string> = {};
for (const t of TUTORIALS.filter((t) => t.kind === 'walkthrough')) {
  tutorialText['tutorial.' + t.id + '.title'] = t.title;
  t.steps.forEach((step, i) => {
    for (const field of ['title', 'body'] as const) {
      tutorialText[`tutorial.${t.id}.${i}.${field}`] = step[field];
      if (step.ios?.[field])
        tutorialText[`tutorial.${t.id}.${i}.ios.${field}`] = step.ios[field]!;
    }
  });
}
// Stable keys serve browsers and mobile shells. Keep legacy native keys for
// saved text versions and older clients; never reuse a retired key.
export const UI_TEXT: Record<string, string> = {
  ...tutorialText,
  'wallet.title':'Your trust',
  'wallet.gameEarned':'You earned {amount} trust',
  'wallet.balance':'{amount} trust',
  'wallet.guest':'Sign in to earn trust.',
  'wallet.filter':'Transaction type',
  'wallet.all':'All transactions',
  'wallet.earned':'Earned',
  'wallet.spent':'Spent',
  'wallet.purchased':'Purchased',
  'wallet.loading':'Loading trust…',
  'wallet.error':'Could not load your trust history. Please try again.',
  'wallet.empty':'No transactions yet.',
  'wallet.more':'Load more',
  'wallet.finish':'Finished a game',
  'wallet.win':'Won a game',
  'wallet.rating':'Storyteller rating bonus',
  'wallet.ratingEarned':'You earned {amount} trust from Storyteller ratings.',
  'wallet.purchase':'Purchased {amount} trust',
  'wallet.cosmetic':'Bought {item}',
  'wallet.item':'a cosmetic',
  'wallet.adjustment':'Balance adjustment',
  'wallet.credit':'Received {amount} trust',
  'wallet.debit':'Deducted {amount} trust',
  'wallet.after':'Balance after: {amount} trust',
  'shop.title':'The shop',
  'shop.soon':'New cosmetics are coming soon. Your existing cosmetics remain free.',
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
  return value; // Always rendered as text, never as HTML or Markdown.
}
export function formatText(
  value: string,
  values: Record<string, string | number> = {},
) {
  return value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
