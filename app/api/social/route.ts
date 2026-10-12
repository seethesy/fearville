import { json, errorResponse, checkOrigin, limited } from '@/lib/game/store';
import { accountAuth } from '@/lib/accounts/service';
import { memberCookie } from '@/lib/game/join';
import {
  setHandle,
  sendRequest,
  acceptRequest,
  dismissRequest,
  removeFriend,
  blockAccount,
  unblockAccount,
} from '@/lib/social/friends';
import {
  sendInvite,
  acceptInvite,
  declineInvite,
  revokeInvite,
} from '@/lib/social/invites';
import { rateStoryteller } from '@/lib/social/ratings';
import { socialView } from '@/lib/social/view';
import { setPrivacy } from '@/lib/social/privacy';
import { blockSeat } from '@/lib/social/reports';

const id = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length < 100
    ? value
    : '';

export async function GET(r: Request) {
  try {
    const a = await accountAuth(r);
    if (!a) return json({ error: 'Sign in to see your friends.' }, 401);
    return json(await socialView(a.id, Date.now()));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const a = await accountAuth(r);
    if (!a)
      return json({ error: 'Sign in to use friends and invitations.' }, 401);
    await limited(r, 'social', 120);
    const raw = await r.text();
    if (raw.length > 8000) throw Error('Request is too large.');
    const body = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    switch (body.action) {
      case 'privacy':
        return json({ privacy: await setPrivacy(a.id, body.privacy) });
      case 'handle':
        return json({ handle: await setHandle(a.id, body.handle) });
      case 'request':
        return json(await sendRequest(a.id, body.handle, now));
      case 'accept':
        await acceptRequest(a.id, id(body.account), now);
        break;
      case 'dismiss':
        await dismissRequest(a.id, id(body.account));
        break;
      case 'remove':
        await removeFriend(a.id, id(body.account));
        break;
      case 'block':
        await blockAccount(a.id, id(body.account), now);
        break;
      case 'blockSeat':
        await blockSeat(a.id, body.code, body.player, now);
        break;
      case 'unblock':
        await unblockAccount(a.id, id(body.account));
        break;
      case 'invite':
        await sendInvite(r, a.id, body.code, body.account, now);
        break;
      case 'acceptInvite': {
        const seat = await acceptInvite(a.id, body.invite, body.name, now);
        return json(seat, 200, { 'Set-Cookie': memberCookie(r, seat.token) });
      }
      case 'declineInvite':
        await declineInvite(a.id, body.invite, now);
        break;
      case 'revokeInvite':
        await revokeInvite(a.id, body.invite);
        break;
      case 'rate':
        return json(
          await rateStoryteller(a.id, body.game, body.stars, body.comment, now),
        );
      default:
        throw Error('Unknown social action.');
    }
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
