import { requireAdmin } from '@/lib/admin/auth';
import { puzzleTuningOverview, tunePuzzles } from '@/lib/admin/service/puzzles';
import { checkOrigin, errorResponse, json, limited } from '@/lib/game/store';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(await puzzleTuningOverview());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const admin = await requireAdmin(request);
    await limited(request, 'puzzle-tuning:' + admin.id, 20);
    const raw = await request.text();
    if (raw.length > 12000) throw Error('Request is too large.');
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw Error('Choose valid tuning settings.');
    return json(await tunePuzzles(admin, body as Record<string, unknown>));
  } catch (error) {
    return errorResponse(error);
  }
}
