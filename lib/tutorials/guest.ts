import type { SeenItem, SeenStatus } from './types.ts';

// Guests keep no tutorial progress across joins: every new seat (a new
// `scope`, code + player id) starts empty, so they see every tutorial again.
// Within one seat the flags survive refreshes and reconnects.
export const GUEST_KEY = 'fv.tutorials.guest';

export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface Stored {
  scope: string;
  seen: Record<string, SeenStatus>;
}

function read(store: KeyValue | null): Stored | null {
  try {
    const raw = store?.getItem(GUEST_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    if (typeof value?.scope !== 'string' || typeof value.seen !== 'object')
      return null;
    return value;
  } catch {
    return null;
  }
}

// Seen items for this scope. Without a scope (a page outside the table) the
// current seat's flags apply.
export function readGuest(
  store: KeyValue | null,
  scope: string | null,
): SeenItem[] {
  const value = read(store);
  if (!value || (scope !== null && value.scope !== scope)) return [];
  return Object.entries(value.seen).map(([id, status]) => ({ id, status }));
}

export function writeGuest(
  store: KeyValue | null,
  scope: string | null,
  seen: Record<string, SeenStatus>,
) {
  const current = read(store);
  const value: Stored = {
    scope: scope ?? current?.scope ?? '',
    seen,
  };
  try {
    store?.setItem(GUEST_KEY, JSON.stringify(value));
  } catch {
    // Private browsing or blocked storage: progress stays in memory.
  }
}

// A different seat means a new join: forget the previous seat's flags.
export function isNewScope(store: KeyValue | null, scope: string) {
  const value = read(store);
  return !value || value.scope !== scope;
}
