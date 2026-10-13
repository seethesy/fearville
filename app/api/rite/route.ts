import { authMember, json, errorResponse, checkOrigin } from '@/lib/game/store';
import { requireThat } from '@/lib/game/engine';
import { riteView } from '@/lib/rite/view';
import { table } from '@/lib/game/table-client';
export async function GET(r: Request) {
  try {
    const { actor, code } = await authMember(r);
    const { game, version } = await table(code).read(code, actor);
    const requested = new URL(r.url).searchParams.get('pov');
    const pov =
      actor.host && game.sandbox
        ? game.players.find((p) => p.id === requested && p.dummy && !p.departed)
        : null;
    const viewer = pov ? { id: pov.id, host: false } : actor;
    const now = Date.now();
    return json({
      code,
      me: viewer.id,
      rite: riteView(game, viewer, now),
      version,
      serverNow: now,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const { actor, code } = await authMember(r);
    const raw = await r.text();
    requireThat(raw.length < 20000, 'Request is too large.');
    const c = JSON.parse(raw);
    requireThat(typeof c.action === 'string', 'Choose a Rite action.');
    const result = await table(code).action(code, actor, c, true);
    return json(
      result,
      'status' in result && typeof result.status === 'number'
        ? result.status
        : 200,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
