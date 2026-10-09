import type { Control, Field } from './types.ts';
import type { GameView } from './view.ts';

// Only the Storyteller receives actual roles. Keep calculated choice lists in
// their view; never add role information to a player's payload.
export function eligibleField(
  field: Field,
  control: Control,
  values: Record<string, unknown>,
  _game: GameView,
): Field {
  let options = field.options;
  if (!options) return field;
  if (control.action === 'night') {
    if (field.key === 'target' || field.key === 'target2') {
      const other = values[field.key === 'target' ? 'target2' : 'target'];
      options = options.filter((o) => !o.value || o.value !== other);
    }
  }
  if (
    ['configure', 'start'].includes(control.action) &&
    field.key.startsWith('bluff')
  )
    options = options.filter(
      (o) =>
        !o.value ||
        !['bluff1', 'bluff2', 'bluff3'].some(
          (key) => key !== field.key && values[key] === o.value,
        ),
    );
  return { ...field, options };
}
