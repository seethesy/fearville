'use client';
// Small client helpers shared by the social UI.
export type PublicAccount = {
  id: string;
  name: string;
  handle: string | null;
  avatar?: string;
};
export type TableSocial = {
  account: string | null;
  error?: string;
  friends: (PublicAccount & {
    together: number;
    seated: boolean;
    invitesAllowed: boolean;
    invite: { id: string; status: string } | null;
  })[];
  rating: {
    game: string | null;
    storyteller: {
      name: string;
      handle: string | null;
      avatar?: string;
    } | null;
    hostName?: string;
    canRate: boolean;
    reason: string;
    mine?: { stars: number; comment: string; created: number } | null;
  };
};
export async function social<T = { ok: true }>(
  body: Record<string, unknown>,
): Promise<T> {
  const r = await fetch('/api/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error || 'Request failed.');
  return data;
}
export async function load<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store' });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error || 'Could not load.');
  return data;
}
export const display = (a: PublicAccount) =>
  a.handle ? '@' + a.handle : a.name;
export const when = (at: number) =>
  new Date(at).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
