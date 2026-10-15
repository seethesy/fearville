import { accountAuth } from '@/lib/accounts/service';
import { json, errorResponse, limited } from '@/lib/game/store';
import { rushKind } from '@/lib/puzzle-rush/engine';
import { generateRush } from '@/lib/puzzle-rush/generate';

export async function GET(request: Request) {
  try {
    const account = await accountAuth(request);
    if (!account) return json({error:'Sign in to play Puzzle Rush.'},401);
    const kind = rushKind(new URL(request.url).searchParams.get('puzzle') ?? 'board');
    await limited(request,'puzzle-rush',30);
    return json({puzzle:generateRush(kind,crypto.randomUUID())});
  } catch (error) { return errorResponse(error); }
}
