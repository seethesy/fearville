import {
  auth,
  read,
  save,
  json,
  errorResponse,
  checkOrigin,
} from '@/lib/game/store';
import { tick, execute, requireThat } from '@/lib/game/engine';
import { view } from '@/lib/game/view';
import { syncResult } from '@/lib/social/results';
export async function GET(r: Request) {
  try {
    const { actor, code } = await auth(r);
    for (let i = 0; i < 8; i++) {
      await auth(r);
      const { game, version, created } = await read(code);
      if (
        !actor.host &&
        !game.players.some((p) => p.id === actor.id && !p.departed)
      )
        throw Error('AUTH');
      const now = Date.now();
      const changed = tick(game, now);
      if (changed && !(await save(game, version))) continue;
      // Ended games are recorded here as well, so a result that failed to
      // record at the moment the game ended is recorded on the next poll.
      if (game.phase === 'ended') await syncResult(game, created, now);
      return json(view(game, actor, version + Number(changed), now));
    }
    return json({ error: 'The table is busy. Reconnect in a moment.' }, 409);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const { actor, code } = await auth(r);
    const raw = await r.text();
    requireThat(raw.length < 20000, 'Request is too large.');
    const c = JSON.parse(raw);
    requireThat(typeof c.action === 'string', 'Choose an action.');
    if (c.action === 'vote' && typeof c.yes === 'string')
      c.yes = c.yes === 'true';
    for (let i = 0; i < 8; i++) {
      await auth(r);
      const { game, version, created } = await read(code);
      const now = Date.now();
      const before = game.phase;
      if (tick(game, now)) {
        if (!(await save(game, version))) continue;
        return json(
          { error: 'The timer advanced the game. Review the current phase.' },
          409,
        );
      }
      if (
        !['vote', 'chat', 'nightPoll', 'nightChoice'].includes(c.action) &&
        c.version !== version
      )
        return json(
          { error: 'The table changed. Review this action again.' },
          409,
        );
      const summary = execute(game, actor, c, now);
      if (c.preview) return json({ summary, version });
      if (!(await save(game, version))) continue;
      // Record the result when the game ends; withdraw it if the Storyteller
      // rewinds out of the ended phase. Both are idempotent.
      if (game.phase === 'ended' || before === 'ended')
        await syncResult(game, created, now);
      return json({ summary, game: view(game, actor, version + 1, now) });
    }
    return json(
      { error: 'Another action arrived at the same time. Please try again.' },
      409,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
