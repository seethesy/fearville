'use client';
import { Check, X, Minus } from 'lucide-react';
export function VoteChoices({
  value,
  onChange,
  disabled = false,
  label = 'Vote',
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <fieldset className="vote-choices" aria-label={label}>
      {[
        { value: 'true', label: 'Yes', Icon: Check },
        { value: 'false', label: 'No', Icon: X },
        { value: 'null', label: 'Abstain', Icon: Minus },
      ].map(({ value: choice, label: text, Icon }) => (
        <button
          type="button"
          key={choice}
          className={`vote-choice vote-${choice}`}
          aria-pressed={value === choice}
          disabled={disabled}
          onClick={() => onChange(choice)}
        >
          <Icon aria-hidden="true" />
          {text}
        </button>
      ))}
    </fieldset>
  );
}
