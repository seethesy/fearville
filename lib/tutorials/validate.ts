import { isTutorialId } from './content.ts';
import type { SeenItem, SeenStatus } from './types.ts';

const STATUSES: SeenStatus[] = ['completed', 'skipped'];

// Validates untrusted input: known tutorial ids and statuses only.
export function parseItems(body: Record<string, unknown>): SeenItem[] {
  const raw: unknown[] = Array.isArray(body.items)
    ? body.items
    : [{ id: body.id, status: body.status }];
  if (raw.length > 50) throw Error('Too many tutorials in one request.');
  const items = new Map<string, SeenStatus>();
  for (const value of raw) {
    const item = value as { id?: unknown; status?: unknown };
    if (!isTutorialId(item?.id)) throw Error('Unknown tutorial.');
    const status = STATUSES.includes(item.status as SeenStatus)
      ? (item.status as SeenStatus)
      : null;
    if (!status) throw Error('Unknown tutorial status.');
    // Within one request a completion wins over a skip.
    if (items.get(item.id) !== 'completed') items.set(item.id, status);
  }
  return [...items].map(([id, status]) => ({ id, status }));
}
