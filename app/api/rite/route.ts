import {
  auth,
  read,
  save,
  json,
  errorResponse,
  checkOrigin,
} from '@/lib/game/store';
import { tick, requireThat, snapshot } from '@/lib/game/engine';
import { riteAction } from '@/lib/rite/engine';
import { riteView } from '@/lib/rite/view';
import type { Command } from '@/lib/game/types';
async function handle(r: Request, c?: Command) {
  const { actor, code } = await auth(r);
  for (let attempt = 0; attempt < 8; attempt++) {
    const { game, version } = await read(code),
      now = Date.now();
    const requested = c?.pov ?? new URL(r.url).searchParams.get('pov');
    const pov =
      actor.host && game.sandbox
        ? game.players.find((p) => p.id === requested && p.dummy && !p.departed)
        : null;
    const viewer = pov ? { id: pov.id, host: false } : actor;
    requireThat(
      actor.host || game.players.some((p) => p.id === actor.id && !p.departed),
      'AUTH',
    );
    const changed = tick(game, now);
    if (c && ['configureRite', 'riteForce', 'riteRedeal'].includes(c.action)) {
      requireThat(viewer.host, 'Only the Storyteller can do that.');
      requireThat(
        c.version === version,
        'The table changed. Refresh setup before saving.',
      );
      snapshot(game, 'Night Rite: ' + c.action, now);
    }
    const summary = c ? riteAction(game, viewer, c, now) : undefined;
    requireThat(!c || summary !== null, 'Choose a Rite action.');
    if ((changed || c) && !(await save(game, version))) continue;
    return json({
      code,
      me: viewer.id,
      rite: riteView(game, viewer, now),
      version: version + Number(changed || !!c),
      serverNow: now,
      summary,
    });
  }
  return json({ error: 'The table is busy. Try again.' }, 409);
}
export async function GET(r: Request) {
  try {
    return await handle(r);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const raw = await r.text();
    requireThat(raw.length < 20000, 'Request is too large.');
    const c = JSON.parse(raw);
    requireThat(typeof c.action === 'string', 'Choose a Rite action.');
    return await handle(r, c);
  } catch (e) {
    return errorResponse(e);
  }
}
