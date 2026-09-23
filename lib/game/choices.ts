import type { Control, Field } from './types.ts';
import type { GameView } from './view.ts';

// Only the Storyteller receives actual roles. Keep calculated choice lists in
// their view; never add role information to a player's payload.
export function eligibleField(
  field: Field,
  control: Control,
  values: Record<string, unknown>,
  game: GameView,
): Field {
  let options = field.options;
  if (!options) return field;
  if (control.action === 'night') {
    if (field.key === 'target' || field.key === 'target2') {
      const other = values[field.key === 'target' ? 'target2' : 'target'];
      options = options.filter((o) => !o.value || o.value !== other);
    }
    if (field.key === 'reveal' && !values.override) {
      const task = game.tasks.find((t) => t.key === values.task);
      const actor = game.players.find((p) => p.id === task?.player);
      if (actor && actor.role !== 'drunk' && !actor.poisoned) {
        const ids = (
          task?.role === 'undertaker'
            ? [game.execution]
            : [values.target, values.target2]
        ).filter(Boolean);
        const checked = ids.length
          ? game.players.filter((p) => ids.includes(p.id))
          : game.players;
        // Registration can legitimately change the character learned.
        if (!checked.some((p) => ['spy', 'recluse'].includes(p.role ?? '')))
          options = options.filter(
            (o) => !o.value || checked.some((p) => p.role === o.value),
          );
      }
    }
  }
  if (control.action === 'configure' && field.key.startsWith('bluff'))
    options = options.filter(
      (o) =>
        !o.value ||
        !['bluff1', 'bluff2', 'bluff3'].some(
          (key) => key !== field.key && values[key] === o.value,
        ),
    );
  return { ...field, options };
}
