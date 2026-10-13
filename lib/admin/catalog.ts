import { AVATARS } from '../game/avatars.ts';
import { DEATH_EFFECTS } from '../game/cosmetics.ts';
// Existing free cosmetics remain free. Grants are durable ownership awards.
export const ITEM_CATALOG = [
  ...AVATARS.map((x) => ({
    id: 'avatar:' + x.id,
    name: x.name,
    kind: 'avatar',
  })),
  ...DEATH_EFFECTS.map((x) => ({
    id: 'effect:' + x.id,
    name: x.name,
    kind: 'effect',
  })),
  { id: 'title:founder', name: 'Founder', kind: 'title' },
  { id: 'title:nightkeeper', name: 'Nightkeeper', kind: 'title' },
];
