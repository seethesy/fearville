'use client';
import { useState } from 'react';
import type { FeedKind } from '@/lib/game/feed';

export function useOlderFeed<T extends { id: string }>(
  kind: FeedKind,
  initial: string | null,
  pov?: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const before = cursor === undefined ? initial : cursor;
  async function load() {
    if (!before || busy) return;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        kind,
        before,
        ...(pov ? { pov } : {}),
      });
      const response = await fetch('/api/table/feed?' + params, {
        cache: 'no-store',
      });
      const data = (await response.json()) as {
        items: T[];
        before: string | null;
        error?: string;
      };
      if (!response.ok)
        throw Error(data.error || 'Could not load older entries.');
      setItems((old) =>
        [...data.items, ...old].filter(
          (item, i, all) => all.findIndex((x) => x.id === item.id) === i,
        ),
      );
      setCursor(data.before);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load older entries.',
      );
    } finally {
      setBusy(false);
    }
  }
  return { items, busy, error, before, load };
}
