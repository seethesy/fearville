// Storyteller and player controls for Holy Moon and Stars.
import { HMS_ROLES, type Game, type Field, type Option } from '../types.ts';
import { team } from '../hms.ts';
export const select = (
  key: string,
  label: string,
  options: Option[],
  value = '',
  required = false,
): Field => ({ key, label, type: 'select', options, value, required });
export const check = (key: string, label: string, value = false): Field => ({
  key,
  label,
  type: 'checkbox',
  value,
});
export const text = (
  key: string,
  label: string,
  value = '',
  hint = '',
): Field => ({
  key,
  label,
  type: 'textarea',
  value,
  ...(hint ? { hint } : {}),
});
export const none = [{ value: '', label: 'None' }];
export const roleList = (filter: (id: string) => boolean = () => true) =>
  HMS_ROLES.filter((r) => filter(r.id)).map((r) => ({
    value: r.id,
    label: r.name,
  }));
export const outOfPlay = (g: Game, t: string) =>
  roleList((id) => team(id) === t && !g.players.some((p) => p.role === id));
