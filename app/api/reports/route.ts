// POST /api/reports — report a player profile, a chat message or a
// Storyteller rating comment (FEAR-119).
//   { kind: 'player', handle, reason, note? }   signed-in account
//   { kind: 'chat', messageId, reason, note? }  seated player or Storyteller
//   { kind: 'rating', ref, reason, note? }      the rated Storyteller
// reason: harassment | hate | sexual | spam | cheating | other
import {
  json,
  errorResponse,
  checkOrigin,
  limited,
  authenticatedRead,
} from '@/lib/game/store';
import { accountAuth } from '@/lib/accounts/service';
import { reportChat, reportPlayer, reportRating } from '@/lib/social/reports';

export async function POST(r: Request) {
  try {
    checkOrigin(r);
    await limited(r, 'report', 10);
    const raw = await r.text();
    if (raw.length > 4000) throw Error('Request is too large.');
    const body = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    const account = await accountAuth(r);
    if (body.kind === 'chat') {
      const { game, actor } = await authenticatedRead(r);
      return json(
        await reportChat(
          game,
          actor,
          account?.id ?? null,
          body.messageId,
          body.reason,
          body.note,
          now,
        ),
      );
    }
    if (!account) return json({ error: 'Sign in to report a player.' }, 401);
    if (body.kind === 'player')
      return json(
        await reportPlayer(
          account.id,
          body.handle,
          body.reason,
          body.note,
          now,
        ),
      );
    if (body.kind === 'rating')
      return json(
        await reportRating(account.id, body.ref, body.reason, body.note, now),
      );
    throw Error('Choose what to report.');
  } catch (e) {
    return errorResponse(e);
  }
}
