import { role, uuid, type Game } from './types.ts';

// Only called when the Storyteller resolves the corresponding first-night task.
// Store the delivered information, rather than recomputing it after role changes.
export function deliverIntroduction(
  g: Game,
  task: 'minioninfo' | 'demoninfo',
  at: number,
) {
  const haunts = g.players.filter((p) => role(p.role)?.team === 'minion');
  const horrors = g.players.filter((p) => role(p.role)?.team === 'demon');
  const detailed = g.script === 'holyMoonStars';
  const list = (players: typeof haunts, withRoles = false) =>
    players
      .map((p) => `${p.name}${withRoles ? ` (${role(p.role)?.name})` : ''}`)
      .join(', ') || 'None';
  const teamInfo =
    task === 'minioninfo'
      ? `Your Horror is ${list(horrors, detailed)}. Haunts: ${list(haunts)}.`
      : `Your Haunts: ${list(haunts, detailed)}.${g.players.length >= 7 ? ` Out-of-play bluffs: ${g.bluffs.map((id) => role(id)?.name).join(', ')}.` : ''}`;
  const celestial = detailed
    ? ` ${g.players.some((p) => p.role === 'celestial') ? 'A Celestial is in play.' : 'No Celestial is in play.'}`
    : '';
  const recipients = task === 'demoninfo' ? horrors : haunts;
  g.nightIntroductions ??= {};
  for (const p of recipients.filter((p) => !p.departed)) {
    const id = uuid();
    const text = `You are ${task === 'demoninfo' ? 'the Horror' : 'a Haunt'} (${role(p.role)?.name}). ${teamInfo}${celestial}`;
    g.nightIntroductions[p.id] = { id, text };
    g.messages.push({ id, from: 'host', to: p.id, text, at, kind: 'info' });
  }
  return `${teamInfo}${celestial} Sent privately to ${task === 'demoninfo' ? 'the Horror' : 'Haunts'}.`;
}
