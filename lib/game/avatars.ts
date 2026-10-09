export const AVATARS = [
  { id: 'raven', name: 'Raven', color: '#9cacf2' },
  { id: 'ghost', name: 'Ghost', color: '#b8dfd5' },
  { id: 'moon', name: 'Moon', color: '#edcc87' },
  { id: 'cat', name: 'Black cat', color: '#d6ace9' },
  { id: 'skull', name: 'Skull', color: '#e5c6b5' },
  { id: 'flame', name: 'Ember', color: '#efab81' },
  { id: 'rose', name: 'Night rose', color: '#e8a5bb' },
  { id: 'eye', name: 'Watcher', color: '#a8d3e8' },
  { id: 'bat', name: 'Nightwing', color: '#a9a0e8' },
  { id: 'spider', name: 'Widow', color: '#d3a5bb' },
  { id: 'wolf', name: 'Moonhound', color: '#b3becb' },
  { id: 'crown', name: 'Lost monarch', color: '#e6c76d' },
  { id: 'dagger', name: 'Silver blade', color: '#d7e0ec' },
  { id: 'lantern', name: 'Lamplighter', color: '#efc693' },
  { id: 'key', name: 'Gatekeeper', color: '#c6ae78' },
  { id: 'book', name: 'Spellbinder', color: '#c4b0eb' },
  { id: 'hourglass', name: 'Timekeeper', color: '#a6d8d2' },
  { id: 'gem', name: 'Amethyst', color: '#cda6fa' },
  { id: 'mushroom', name: 'Toadstool', color: '#dfaaa0' },
  { id: 'mask', name: 'Masquerade', color: '#e3c9b6' },
] as const;

export function isPresetAvatar(value: unknown) {
  return AVATARS.some((avatar) => avatar.id === value);
}

type AvatarSeat = { id: string; avatar?: string };

// Reserve explicit choices first, then allocate missing/legacy duplicate presets.
// Stable identity order keeps this independent of seating and view order.
export function resolvedAvatars(players: readonly AvatarSeat[]) {
  const result = new Map<string, string>();
  const used = new Set<string>();
  const ordered = [...players].sort((a, b) => a.id.localeCompare(b.id));
  for (const player of ordered) {
    if (
      player.avatar &&
      validAvatar(player.avatar) &&
      (!isPresetAvatar(player.avatar) || !used.has(player.avatar))
    ) {
      result.set(player.id, player.avatar);
      if (isPresetAvatar(player.avatar)) used.add(player.avatar);
    }
  }
  for (const player of ordered) {
    if (result.has(player.id)) continue;
    const preferred = defaultAvatar(player.id);
    const avatar = !used.has(preferred)
      ? preferred
      : AVATARS.find((item) => !used.has(item.id))?.id;
    if (!avatar) throw Error('No preset avatars are available.');
    used.add(avatar);
    result.set(player.id, avatar);
  }
  return result;
}

export function assignAvatars(players: AvatarSeat[]) {
  const resolved = resolvedAvatars(players);
  for (const player of players) player.avatar = resolved.get(player.id)!;
}

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
