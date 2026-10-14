import { type Field, type Option } from '../types.ts';
export const select = (
  key: string,
  label: string,
  options: Option[],
  value = '',
  required = false,
): Field => ({ key, label, type: 'select', options, value, required });
export const input = (
  key: string,
  label: string,
  value = '',
  type: Field['type'] = 'text',
): Field => ({ key, label, type, value });
export const check = (key: string, label: string, value = false): Field => ({
  key,
  label,
  type: 'checkbox',
  value,
});
export const num = (
  key: string,
  label: string,
  value: number,
  min = 1,
  max = 3600,
): Field => ({ key, label, type: 'number', value, min, max, required: true });
export const optional = [{ value: '', label: 'None' }];
export const overrideFields: Field[] = [
  check('override', 'Override standard rules'),
];
export type AddControl = (
  action: string,
  title: string,
  description: string,
  fields?: Field[],
  danger?: boolean,
) => void;
