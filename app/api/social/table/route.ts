import { json, errorResponse } from '@/lib/game/store';
import { accountAuth } from '@/lib/accounts/service';
import { memberOf } from '@/lib/social/invites';
import { tableView } from '@/lib/social/view';

// Social context for the table page. Requires both a signed-in account and a
// seat at the requested table, so nobody can read another table's roster.
export async function GET(r: Request) {
  try {
    const a = await accountAuth(r);
    if (!a) return json({ account: null });
    const code = (new URL(r.url).searchParams.get('code') || '').toUpperCase();
    if (!/^[A-Z]{6}$/.test(code)) throw Error('Choose a session.');
    if (!(await memberOf(r, a.id, code)))
      return json({ error: 'You are not seated at this table.' }, 403);
    return json({
      account: a.id,
      ...(await tableView(a.id, code, Date.now())),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
