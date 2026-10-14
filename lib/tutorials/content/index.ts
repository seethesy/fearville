import type { Illustration, Tutorial } from '../types.ts';
import { WALKTHROUGH } from './walkthrough.ts';
import { SECTIONS } from './sections.ts';
import { RITE_GUIDES } from './rite.ts';
import { HOST_SECTIONS, HOST_TOUR } from './host.ts';
export const TUTORIALS: Tutorial[] = [
  ...WALKTHROUGH,
  ...SECTIONS,
  ...HOST_SECTIONS,
  ...HOST_TOUR,
  ...RITE_GUIDES,
];
// The guide for a Night Rite pattern (board, grid, ritual or lab).
export const riteGuideId = (pattern: string) => `guide.${pattern}`;
export const WALKTHROUGH_IDS = WALKTHROUGH.map((t) => t.id);
export function tutorial(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
export function isTutorialId(id: unknown): id is string {
  return typeof id === 'string' && TUTORIALS.some((t) => t.id === id);
}
export function sectionTutorial(section: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.kind === 'section' && t.section === section);
}
// iPhone: SF Symbol for each illustration.
export const IOS_SYMBOLS: Record<Illustration, string> = {
  welcome: 'sparkles',
  seat: 'chair',
  appearance: 'person.crop.circle',
  invite: 'person.badge.plus',
  script: 'scroll',
  character: 'eye.slash',
  flow: 'list.bullet.rectangle',
  clock: 'timer',
  'day-night': 'sun.horizon',
  night: 'moon.stars',
  nominate: 'hand.raised',
  vote: 'checkmark.circle',
  notes: 'note.text',
  messages: 'bubble.left.and.bubble.right',
  help: 'questionmark.circle',
  settings: 'gearshape',
  rules: 'book',
  recap: 'clock.arrow.circlepath',
  friends: 'person.2',
  stats: 'chart.bar',
  profile: 'person.text.rectangle',
  account: 'person.crop.square',
  done: 'checkmark.seal',
};
