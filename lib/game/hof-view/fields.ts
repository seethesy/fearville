// Storyteller and player controls for Horrors of Fearville.
import { HOF_ROLES, type Field, type Option, type Team } from '../types.ts';
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
export const text = (key: string, label: string, hint = ''): Field => ({
  key,
  label,
  type: 'textarea',
  value: '',
  ...(hint ? { hint } : {}),
});
export const none = [{ value: '', label: 'None' }];
export const roles = (filter: (t: Team) => boolean = () => true) =>
  HOF_ROLES.filter((r) => filter(r.team)).map((r) => ({
    value: r.id,
    label: r.name,
  }));
export const DAY = [
  'discovery',
  'discussion',
  'nomination',
  'defense',
  'voting',
  'dayReview',
];
