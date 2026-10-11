import type { Actor, Command, Game } from './types.ts';
import { controls } from './view.ts';

// These commands either express an explicit correction or identify the exact
// task, death, or ballot they act on. The engine checks the current game state.
const safeHostActions = new Set([
  'pause',
  'resume',
  'extend',
  'assignRole',
  'setPlayerStatus',
  'setRanked',
  'correctVote',
  'night',
  'nightSkip',
  'nightDefer',
  'resolveDeath',
]);
const playerActions = new Set([
  'claimSeat', 'leaveSeat', 'setAvatar', 'saveNotebook', 'chat', 'nightChoice',
  'nominate', 'vote', 'mvpVote', 'returnLobby', 'bodyguardAccept',
  'bodyguardDecline', 'vigilanteDeclare', 'researcherDeclare', 'hagDeclare',
  'astrophage', 'reap', 'fateweaverPref',
]);

export function canApplyLatest(actor: Actor, command: Command): boolean {
  if (!actor.host) return playerActions.has(command.action);
  if (!safeHostActions.has(command.action)) return false;
  switch (command.action) {
    case 'pause':
    case 'resume':
    case 'extend':
      return typeof command.phaseToken === 'string' && command.phaseToken.length > 0;
    case 'night':
    case 'nightSkip':
    case 'nightDefer':
      return typeof command.task === 'string' && command.task.length > 0 && Number.isInteger(command.night);
    case 'setPlayerStatus':
      return Number.isInteger(command.night);
    case 'resolveDeath':
      return typeof command.death === 'string' && command.death.length > 0;
    case 'correctVote':
      return typeof command.ballot === 'string' && command.ballot.length > 0;
    default:
      return true;
  }
}

// A stale edit is safe when this seat's editable fields have not changed.
// Player choices or timer updates elsewhere need not discard the form.
export function canApplyUnchangedEdit(g: Game, actor: Actor, command: Command): boolean {
  if (!actor.host || command.action !== 'edit' || !command.base || typeof command.base !== 'object' || Array.isArray(command.base))
    return false;
  const fields = controls(g, actor).find((control) =>
    control.action === 'edit' && control.fields[0]?.value === command.player,
  )?.fields;
  if (!fields) return false;
  const base = command.base as Record<string, unknown>;
  return Object.keys(base).length === fields.length && fields.every((field) =>
    Object.hasOwn(base, field.key) && base[field.key] === (field.value ?? ''),
  );
}
