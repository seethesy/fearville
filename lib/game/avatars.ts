export const AVATARS = [
  { id: 'raven', name: 'Raven', color: '#9cacf2' },
  { id: 'ghost', name: 'Ghost', color: '#b8dfd5' },
  { id: 'moon', name: 'Moon', color: '#edcc87' },
  { id: 'cat', name: 'Black cat', color: '#d6ace9' },
  { id: 'skull', name: 'Skull', color: '#e5c6b5' },
  { id: 'flame', name: 'Ember', color: '#efab81' },
  { id: 'rose', name: 'Night rose', color: '#e8a5bb' },
  { id: 'eye', name: 'Watcher', color: '#a8d3e8' },
] as const;

export function validAvatar(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (AVATARS.some((a) => a.id === value)) return true;
  // Only bounded raster data, never remote tracking URLs or active SVG content.
  return (
    value.length <= 16000 &&
    /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

export function defaultAvatar(id: string) {
  const index = Array.from(id).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return AVATARS[index % AVATARS.length].id;
}
