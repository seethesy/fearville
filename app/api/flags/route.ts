// FEAR-122: the client-safe subset of remote switches (maintenance banner,
// switched-off features, app build policy). Public and read-only.
import { readFlags } from '@/lib/flags/flags';
import { publicFlags } from '@/lib/flags/catalog';
import { json, errorResponse } from '@/lib/game/store';
export async function GET() {
  try {
    return json(publicFlags(await readFlags()), 200, {
      'Cache-Control': 'no-store',
    });
  } catch (e) {
    return errorResponse(e);
  }
}
