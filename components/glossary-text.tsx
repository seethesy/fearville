'use client';

import { useId } from 'react';
import { glossarySegments, glossaryTerm } from '@/lib/game/glossary';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
} from './ui/popover';
import { useLiveText } from './text-context';

export function DefinitionTerm({
  text,
  termId,
}: {
  text: string;
  termId: string;
}) {
  const descriptionId = useId();
  const term = glossaryTerm(termId);
  const live = useLiveText();
  if (!term) return text;
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="glossary-trigger"
        aria-describedby={descriptionId}
      >
        {text}
      </PopoverTrigger>
      <PopoverContent className="glossary-bubble" sideOffset={8}>
        <PopoverTitle>
          {live(`glossary.${term.id}.term`, term.term)}
        </PopoverTitle>
        <PopoverDescription id={descriptionId}>
          {live(`glossary.${term.id}.definition`, term.definition)}
        </PopoverDescription>
        {term.example && (
          <p className="glossary-example">
            Example: {live(`glossary.${term.id}.example`, term.example)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function GlossaryText({
  text = '',
  excludeId,
}: {
  text?: string;
  excludeId?: string;
}) {
  return (
    <>
      {glossarySegments(text, excludeId).map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <DefinitionTerm
            key={`${part.id}:${i}`}
            text={part.text}
            termId={part.id}
          />
        ),
      )}
    </>
  );
}
