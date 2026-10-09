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

export type DeathEffectId = (typeof DEATH_EFFECTS)[number]['id'];
export function validDeathEffect(value: unknown): value is DeathEffectId {
  return DEATH_EFFECTS.some((item) => item.id === value);
}
