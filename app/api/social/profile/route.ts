import { json, errorResponse } from '@/lib/game/store';
import { accountAuth } from '@/lib/accounts/service';
import { profileView } from '@/lib/social/view';

export async function GET(r: Request) {
  try {
    const a = await accountAuth(r);
    if (!a) return json({ error: 'Sign in to view player profiles.' }, 401);
    const handle = new URL(r.url).searchParams.get('handle');
    return json(await profileView(a.id, handle));
  } catch (e) {
    return errorResponse(e);
  }
}
