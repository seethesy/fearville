'use client';
import { createContext, useContext } from 'react';
import { UI_TEXT } from '@/lib/ui-text/registry';

// FEAR-173: shared state for editable official text. Lives apart from
// components/ui-text.tsx so low-level components (glossary popovers,
// markdown) can read live text without an import cycle.
export type Override = { value: string; version: number };
export type Draft = {
  key: string;
  value: string;
  summary: string | null;
  base: number;
  updated: number;
  editor: string;
};
export const TextContext = createContext({
  overrides: {} as Record<string, Override>,
  drafts: {} as Record<string, Draft>,
  edit: false,
  canEdit: false,
  admin: false,
  setEdit: (_value: boolean) => {},
  select: (_key: string) => {},
  refresh: async () => {},
});

/**
 * Live text for any registry key: the editor's draft while in edit mode, else
 * the published override, else the bundled default. `fallback` covers keys
 * outside the registry (e.g. a role added later).
 */
export function useLiveText() {
  const c = useContext(TextContext);
  return (key: string, fallback = ''): string =>
    (c.edit ? c.drafts[key]?.value : undefined) ??
    c.overrides[key]?.value ??
    (Object.hasOwn(UI_TEXT, key) ? UI_TEXT[key] : fallback);
}
