export const PORTRAIT_FRAMES = [
  { id: 'simple', name: 'Simple', description: 'A clean portrait rim.' },
  {
    id: 'silver',
    name: 'Moonlit silver',
    description: 'Cold silver and a lunar glint.',
  },
  {
    id: 'thorns',
    name: 'Thorn wreath',
    description: 'A dark rosewood wreath.',
  },
  {
    id: 'gilded',
    name: 'Gilded relic',
    description: 'An antique golden keepsake.',
  },
  {
    id: 'spectral',
    name: 'Haunted glass',
    description: 'A pale, spectral halo.',
  },
] as const;

export const DEATH_EFFECTS = [
  {
    id: 'spirit',
    name: 'Departing spirit',
    description: 'A ghost rises into the mist.',
  },
  {
    id: 'embers',
    name: 'Last ember',
    description: 'Warm sparks scatter and fade.',
  },
  {
    id: 'petals',
    name: 'Fallen petals',
    description: 'Crimson petals drift away.',
  },
  {
    id: 'mist',
    name: 'Into the fog',
    description: 'A ring of mist dissolves.',
  },
  { id: 'none', name: 'Quiet farewell', description: 'No death animation.' },
] as const;

export type PortraitFrame = (typeof PORTRAIT_FRAMES)[number]['id'];
export type DeathEffectId = (typeof DEATH_EFFECTS)[number]['id'];
export function validFrame(value: unknown): value is PortraitFrame {
  return PORTRAIT_FRAMES.some((item) => item.id === value);
}
export function validDeathEffect(value: unknown): value is DeathEffectId {
  return DEATH_EFFECTS.some((item) => item.id === value);
}
