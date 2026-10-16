'use client';
import { useContext } from 'react';
import { UI_TEXT } from '@/lib/ui-text/registry';
import { GlossaryText } from './glossary-text';
import { TextContext, useLiveText } from './text-context';
import { UiText } from './ui-text';

// FEAR-173: editable character names and ability text. Display only: the
// engine keeps working from role ids, so a reworded ability never changes
// how it resolves.
export function RoleName({ id, fallback }: { id: string; fallback?: string }) {
  return <UiText id={`role.${id}.name`} fallback={fallback} />;
}

export function RoleAbility({
  id,
  fallback,
}: {
  id?: string;
  fallback?: string;
}) {
  const { edit } = useContext(TextContext);
  const live = useLiveText();
  const key = `role.${id}.ability`;
  if (!id || !Object.hasOwn(UI_TEXT, key))
    return <GlossaryText text={fallback} />;
  // Edit mode shows the editable text; otherwise glossary terms are linked.
  if (edit) return <UiText id={key} />;
  return <GlossaryText text={live(key, fallback)} />;
}

/** Live role name as a string (for titles, aria labels). */
export function useRoleName() {
  const live = useLiveText();
  return (id: string, fallback = '') => live(`role.${id}.name`, fallback);
}
