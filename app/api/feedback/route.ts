// FEAR-159: feedback and bug report forms.
//   GET  /api/feedback?context=general|bug|script|puzzle|game-end → { form }
//   POST /api/feedback { form, answers, subject?, guest?, client?, code? }
// Accounts and guests can submit. A guest sends an anonymous random id its
// device keeps. Bug reports attach whitelisted app details and, when the
// reporter is seated at `code`, public table details (never hidden info).
import { accountAuth } from '@/lib/accounts/service';
import {
  authenticatedRead,
  checkOrigin,
  errorResponse,
  json,
  limited,
} from '@/lib/game/store';
import {
  LIMITS,
  clientContext,
  gameContext,
  isContext,
} from '@/lib/feedback/forms';
import { activeForm, submitFeedback } from '@/lib/feedback/store';

export async function GET(r: Request) {
  try {
    const context = new URL(r.url).searchParams.get('context');
    if (!isContext(context)) throw Error('Choose a valid form.');
    const form = await activeForm(context);
    if (!form) return json({ error: 'No form is available.' }, 404);
    return json({ form });
  } catch (e) {
    return errorResponse(e);
  }
}

const GUEST_ID = /^[A-Za-z0-9-]{16,64}$/;

export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const raw = await r.text();
    if (raw.length > LIMITS.body) throw Error('Request is too large.');
    const body = JSON.parse(raw) as Record<string, unknown>;
    const account = await accountAuth(r);
    await limited(r, account ? 'feedback' : 'feedback:guest', account ? 10 : 5);
    const guest =
      !account && typeof body.guest === 'string' && GUEST_ID.test(body.guest)
        ? body.guest
        : null;
    let game: Record<string, unknown> | undefined;
    if (typeof body.code === 'string' && body.code) {
      try {
        const seat = await authenticatedRead(r);
        if (seat.code === body.code.toUpperCase())
          game = gameContext(seat.game, seat.actor.host);
      } catch {
        // Not seated there: the report is still accepted without table details.
      }
    }
    return json(
      await submitFeedback(
        {
          form: body.form,
          answers: body.answers,
          subject: body.subject,
          account: account?.id ?? null,
          guest,
          client: clientContext(body.client),
          game,
        },
        Date.now(),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
