import { checkOrigin, errorResponse, json, limited } from '@/lib/game/store';
import { puzzleRequest, createPuzzle } from '@/lib/rite/puzzle';
import { readGeneration } from '@/lib/rite/generation-store';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await limited(request, 'standalone-puzzles', 20);
    const raw = await request.text();
    if (raw.length > 2048) throw Error('Request is too large.');
    const input = puzzleRequest(JSON.parse(raw));
    const snapshot = await readGeneration(input.revision);
    return json({ puzzle: createPuzzle(input, snapshot) });
  } catch (error) {
    return errorResponse(error);
  }
}
