import { authMember, json, errorResponse, checkOrigin } from '@/lib/game/store';
import { requireThat } from '@/lib/game/engine';
import { tableView } from '@/lib/game/visible-view';
import { table } from '@/lib/game/table-client';
import { povViewer } from '@/lib/game/pov';
export async function GET(r: Request) {
  try {
    const { actor, code } = await authMember(r);
    const { game, version } = await table(code).read(code, actor);
    const viewer = povViewer(
      game,
      actor,
      new URL(r.url).searchParams.get('pov'),
    );
    return json(
      await tableView(
        game,
        viewer,
        version,
        Date.now(),
        !!game.sandbox && actor.host,
        actor.id,
        new URL(r.url).searchParams.get('compactRecaps') === '1',
      ),
    );
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
    requireThat(typeof c.action === 'string', 'Choose an action.');
    if (
      ['vote', 'correctVote'].includes(c.action) &&
      typeof c.yes === 'string'
    ) {
      requireThat(
        ['true', 'false', 'null'].includes(c.yes),
        'Choose yes, no, or abstain.',
      );
      c.yes = c.yes === 'null' ? null : c.yes === 'true';
    }
    const result = await table(code).action(code, actor, c);
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
