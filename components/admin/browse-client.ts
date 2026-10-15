// FEAR-158: client calls for the admin browsing the normal UI.
export type BrowseCatalog = {
  fixtures: {
    id: string;
    title: string;
    description: string;
    scripts: ('horrors' | 'holyMoonStars')[];
  }[];
  seats: { min: number; max: number; default: number };
};

export const VIEWER_LABELS: Record<string, string> = {
  guest: 'Guest (signed out)',
  player: 'Signed-in player (demo account)',
  storyteller: 'Storyteller (private sandbox table)',
  observer: 'Observer (live table, read-only)',
};

/** Runs a browse action, then navigates where the server says. */
export async function browseAction(body: Record<string, unknown>) {
  const r = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, action: 'browse' }),
  });
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    redirect?: string;
  };
  if (!r.ok) throw Error(data.error || 'Request failed.');
  window.location.href = data.redirect ?? '/';
}

export async function loadBrowseCatalog() {
  const r = await fetch('/api/admin?view=browse', { cache: 'no-store' });
  const data = (await r.json()) as BrowseCatalog & { error?: string };
  if (!r.ok) throw Error(data.error || 'Could not load table states.');
  return data;
}
