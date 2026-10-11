import type { Actor, Command, Game } from './types.ts';

export type ScopedUpdate = {
  set: [string, unknown][];
  guard: [string, unknown][];
  append?: [string, unknown];
  messageId?: string;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pathKey = (key: string) => JSON.stringify(key);

// These actions have independent state. Compare their actual dependencies,
// then update only their own fields inside one atomic database statement.
// A simultaneous action elsewhere at the table cannot invalidate the write.
export function scopedUpdate(before: Game, after: Game, actor: Actor, c: Command): ScopedUpdate | null {
  if (before.history.some((h) => h.before)) return null; // migrate legacy snapshots first
  const guard: ScopedUpdate['guard'] = [
    ['$.players', before.players], ['$.phase', before.phase],
    ['$.night', before.night], ['$.day', before.day],
    ['$.gameStartedAt', before.gameStartedAt],
  ];
  if (c.action === 'chat') {
    if (after.messages.length !== before.messages.length + 1 || !same(after.messages.slice(0, -1), before.messages)) return null;
    const message = after.messages.at(-1)!;
    guard.push(['$.hms.channel', before.hms?.channel]);
    return { set: [], guard, append: ['$.messages[#]', message], messageId: message.id };
  }
  if (c.action === 'saveNotebook' && !actor.host && c.started === before.gameStartedAt && before.gameStartedAt !== undefined) {
    const path = `$.notebooks.${pathKey(actor.id)}`;
    guard.push([path, before.notebooks?.[actor.id]]);
    return { set: [[path, after.notebooks?.[actor.id]]], guard };
  }
  if (!actor.host && c.action.startsWith('rite') && before.rite && after.rite) {
    const index = before.rite.squads.findIndex((s) => s.members.includes(actor.id));
    if (index < 0) return null;
    const path = `$.rite.squads[${index}]`;
    const old = before.rite.squads[index], next = after.rite.squads[index];
    if (!next || next.id !== old.id) return null;
    for (const key of ['epoch', 'status', 'windowEnd', 'config', 'pendingRedeal'] as const)
      guard.push([`$.rite.${key}`, before.rite[key]]);
    guard.push([path, old]);
    return { set: [[path, next]], guard };
  }
  return null;
}

// Fail closed if an engine change ever adds side effects outside the scoped
// fields. The ordinary whole-table CAS then handles the command instead.
export function independentCommand(before: Game, after: Game, actor: Actor, c: Command): ScopedUpdate | null {
  const update = scopedUpdate(before, after, actor, c);
  if (!update) return null;
  const top = c.action === 'chat' ? 'messages' : c.action === 'saveNotebook' ? 'notebooks' : 'rite';
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key !== top && !same(before[key as keyof Game], after[key as keyof Game])) return null;
  }
  if (top === 'rite') {
    const index = before.rite!.squads.findIndex((s) => s.members.includes(actor.id));
    if (!same({ ...before.rite, squads: undefined }, { ...after.rite, squads: undefined }) ||
        before.rite!.squads.some((s, i) => i !== index && !same(s, after.rite!.squads[i]))) return null;
  }
  if (top === 'notebooks' && !same(
    { ...before.notebooks, [actor.id]: undefined }, { ...after.notebooks, [actor.id]: undefined },
  )) return null;
  return update;
}
