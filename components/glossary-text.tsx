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

function DefinitionTerm({ text, termId }: { text: string; termId: string }) {
  const descriptionId = useId();
  const term = glossaryTerm(termId);
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
        <PopoverTitle>{term.term}</PopoverTitle>
        <PopoverDescription id={descriptionId}>
          {term.definition}
        </PopoverDescription>
        {term.example && (
          <p className="glossary-example">Example: {term.example}</p>
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
