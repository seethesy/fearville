'use client';
import { useState } from 'react';
import type { FeedKind } from '@/lib/game/feed';
type FeedState<T> = {
  scope: string;
  revision: number;
  items: T[];
  cursor?: string | null;
  busy: boolean;
  error: string;
};
export function useOlderFeed<T extends { id: string }>(
  kind: FeedKind,
  initial: string | null,
  pov?: string,
  scope = '',
) {
  const empty = (revision = 0): FeedState<T> => ({
    scope,
    revision,
    items: [],
    busy: false,
    error: '',
  });
  const [saved, setSaved] = useState<FeedState<T>>(empty);
  // Reset this hook's state during render when its scope changes. React
  // retries before committing children, so old channel data never flashes
  // and the conversation component keeps its drafts and scroll preferences.
  let current = saved;
  if (saved.scope !== scope) {
    current = empty(saved.revision + 1);
    setSaved(current);
  }
  const before = current.cursor === undefined ? initial : current.cursor;
  const update = (change: (state: FeedState<T>) => FeedState<T>) =>
    setSaved((old) =>
      old.scope === scope && old.revision === current.revision
        ? change(old)
        : old,
    );
  async function load() {
    if (!before || current.busy) return;
    update((old) => ({ ...old, busy: true, error: '' }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const params = new URLSearchParams({
        kind,
        before,
        ...(pov ? { pov } : {}),
      });
      const response = await fetch('/api/table/feed?' + params, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = (await response.json()) as {
        items: T[];
        before: string | null;
        error?: string;
      };
      if (!response.ok)
        throw Error(data.error || 'Could not load older entries.');
      update((old) => ({
        ...old,
        items: [...data.items, ...old.items].filter(
          (item, i, all) => all.findIndex((x) => x.id === item.id) === i,
        ),
        cursor: data.before,
      }));
    } catch (e) {
      update((old) => ({
        ...old,
        error: e instanceof Error ? e.message : 'Could not load older entries.',
      }));
    } finally {
      clearTimeout(timeout);
      update((old) => ({ ...old, busy: false }));
    }
  }
  return {
    items: current.items,
    busy: current.busy,
    error: current.error,
    before,
    load,
  };
}
