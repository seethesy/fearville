import { role, uuid, type Game, type Command, type Player } from '../types.ts';
export function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function person(g: Game, id: unknown) {
  const p = g.players.find((p) => p.id === id);
  requireThat(p, 'Player not found.');
  return p;
}
export const nameOf = (g: Game, id: string) =>
  id === 'storyteller'
    ? 'the Storyteller'
    : g.players.find((p) => p.id === id)?.name || 'Nobody';
export const healthy = (p: Player) =>
  !p.poisoned && p.role !== 'drunk' && !p.drunk && !p.feared;
export const evil = (p: Player) =>
  ['minion', 'demon'].includes(role(p.role)?.team || '');
// Travelers are neutral: neither good nor evil.
export const alignment = (p: Player): 'good' | 'evil' | 'neutral' =>
  evil(p) ? 'evil' : role(p.role)?.team === 'traveler' ? 'neutral' : 'good';
export function log(g: Game, text: string, at: number, visible = false) {
  g.log.push({ id: uuid(), text, at, public: visible });
}
export function message(
  g: Game,
  to: string,
  text: string,
  at: number,
  kind: 'chat' | 'info' | 'correction' = 'info',
  from = 'host',
) {
  requireThat(text.length <= 12000, 'Message is too long.');
  g.messages.push({
    id: uuid(),
    from,
    to,
    text,
    at,
    kind,
    ...(to.startsWith('channel:') && g.hms?.channel
      ? { participants: [g.hms.channel.a, g.hms.channel.b] }
      : {}),
  });
}
export function clean(x: unknown, max = 500) {
  return (
    typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
      ? String(x)
      : ''
  )
    .trim()
    .slice(0, max);
}
export function override(c: Command) {
  return !!c.override;
}
export function enforce(condition: unknown, message: string, c: Command) {
  requireThat(
    condition || override(c),
    message + ' Use a Storyteller override if needed.',
  );
}
