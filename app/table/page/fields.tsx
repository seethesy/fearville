'use client';
import { VoteChoices } from '@/components/vote-choices';
import type { Field } from '@/lib/game/types';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
export type Values = Record<string, string | number | boolean>;
export function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
}) {
  if (field.type === 'hidden') return null;
  if (field.key === 'yes' && field.label === 'Vote')
    return (
      <div className="field">
        {field.label}
        <VoteChoices value={String(value)} onChange={onChange} />
      </div>
    );
  if (
    field.type === 'select' &&
    field.options &&
    (['outcome', 'winner'].includes(field.key) ||
      (field.options.length === 2 &&
        field.options.every((o) =>
          ['true', 'false', 'good', 'evil', 'yes', 'no'].includes(o.value),
        )))
  )
    return (
      <fieldset className="field">
        <legend>{field.label}</legend>
        <div className="short-choices">
          {field.options.map((o) => (
            <button
              type="button"
              className="secondary"
              key={o.value}
              aria-pressed={String(value) === o.value}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  if (field.type === 'checkbox')
    return (
      <label className="check-field">
        <Checkbox
          checked={!!value}
          onCheckedChange={(v) => onChange(v === true)}
        />
        {field.label}
      </label>
    );
  return (
    <label className="field">
      {field.label}
      {field.type === 'select' ? (
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => onChange(String(v ?? ''))}
        >
          <SelectTrigger className="select-field" aria-label={field.label}>
            <SelectValue>
              {field.options?.find((o) => o.value === String(value))?.label ||
                'Choose…'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === 'textarea' ? (
        <textarea
          rows={4}
          value={String(value ?? '')}
          maxLength={12000}
          required={field.required}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={field.type}
          value={String(value ?? '')}
          min={field.min}
          max={field.max}
          maxLength={field.key === 'name' ? 32 : 1000}
          required={field.required}
          onChange={(e) =>
            onChange(
              field.type === 'number' ? Number(e.target.value) : e.target.value,
            )
          }
        />
      )}{' '}
      {field.hint && <span className="hint">{field.hint}</span>}
    </label>
  );
}
