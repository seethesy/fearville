import { json, errorResponse, checkOrigin, limited } from '@/lib/game/store';
import { accountAuth } from '@/lib/accounts/service';
import { markSeen, resetSeen, seenFor } from '@/lib/tutorials/progress';
import { parseItems } from '@/lib/tutorials/validate';

// GET  /api/tutorials            → { account, seen: [{ id, status }] }
// POST /api/tutorials            { action: 'mark', items: [{ id, status }] }
//                                 { action: 'mark', id, status }  (iPhone)
//                                 { action: 'reset' }
// Guests receive { account: false, seen: [] } and keep progress on device.

export async function GET(r: Request) {
  try {
    const a = await accountAuth(r);
    if (!a) return json({ account: false, seen: [] });
    return json({ account: true, seen: await seenFor(a.id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const a = await accountAuth(r);
    if (!a) return json({ error: 'Sign in to save tutorial progress.' }, 401);
    await limited(r, 'tutorials', 90);
    const raw = await r.text();
    if (raw.length > 8000) throw Error('Request is too large.');
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.action === 'mark')
      await markSeen(a.id, parseItems(body), Date.now());
    else if (body.action === 'reset') await resetSeen(a.id);
    else throw Error('Unknown tutorial action.');
    return json({ account: true, seen: await seenFor(a.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
