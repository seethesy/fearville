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
    description:
      'A spectral seal fractures as your soul is pulled into a towering column of light.',
  },
  {
    id: 'embers',
    name: 'Last ember',
    description:
      'A molten core charges, erupts into a shockwave, then showers the seat in burning shards.',
  },
  {
    id: 'petals',
    name: 'Fallen petals',
    description:
      'A crimson sigil blooms, shatters into a storm of petals, and falls into darkness.',
  },
  {
    id: 'mist',
    name: 'Into the fog',
    description:
      'An eclipse tears open a swirling fog vortex and collapses around your portrait.',
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
