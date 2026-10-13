'use client';
import { useEffect, useRef, useState } from 'react';
import type { FeedKind } from '@/lib/game/feed';

export function useOlderFeed<T extends { id: string }>(
  kind: FeedKind,
  initial: string | null,
  pov?: string,
  scope = '',
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    ++generation.current;
    setItems([]);
    setCursor(undefined);
    setError('');
    setBusy(false);
  }, [scope]);
  const before = cursor === undefined ? initial : cursor;
  async function load() {
    if (!before || busy) return;
    setBusy(true);
    const current = generation.current;
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
      if (current !== generation.current) return;
      setItems((old) =>
        [...data.items, ...old].filter(
          (item, i, all) => all.findIndex((x) => x.id === item.id) === i,
        ),
      );
      setCursor(data.before);
    } catch (e) {
      if (current !== generation.current) return;
      setError(
        e instanceof Error ? e.message : 'Could not load older entries.',
      );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return { items, busy, error, before, load };
}
