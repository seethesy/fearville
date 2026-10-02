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
      if (game.phase === 'ended')
        await syncResult(game, game.gameStartedAt ?? created, now);
      const requested = new URL(r.url).searchParams.get('pov');
      const pov =
        actor.host && game.sandbox
          ? game.players.find((p) => p.id === requested && p.dummy)
          : null;
      const viewer = pov ? { id: pov.id, host: false } : actor;
      return json(
        view(
          game,
          viewer,
          version + Number(changed),
          now,
          !!game.sandbox && actor.host,
        ),
      );
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
    for (let i = 0; i < 8; i++) {
      await auth(r);
      const { game, version, created } = await read(code);
      const now = Date.now();
      const before = game.phase;
      const pov =
        actor.host && game.sandbox
          ? game.players.find((p) => p.id === c.pov && p.dummy)
          : null;
      const actionActor = pov ? { id: pov.id, host: false } : actor;
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
      if (c.action === 'returnLobby' && before === 'ended')
        await syncResult(game, game.gameStartedAt ?? created, now);
      const summary = execute(game, actionActor, c, now);
      if (c.preview) return json({ summary, version });
      if (!['chat', 'returnLobby'].includes(c.action)) {
        const player = game.players.find((p) => p.id === actionActor.id);
        game.decisions ??= [];
        game.decisions.push({
          id: crypto.randomUUID(),
          at: now,
          actor: actionActor.host ? game.hostName : (player?.name ?? 'Player'),
          text: summary,
        });
      }
      if (!(await save(game, version))) continue;
      // Record the result when the game ends; withdraw it if the Storyteller
      // rewinds out of the ended phase. Both are idempotent.
      if (
        c.action !== 'returnLobby' &&
        (game.phase === 'ended' || before === 'ended')
      )
        await syncResult(game, game.gameStartedAt ?? created, now);
      return json({
        summary,
        game: view(
          game,
          actionActor,
          version + 1,
          now,
          !!game.sandbox && actor.host,
        ),
      });
    }
    return json(
      { error: 'Another action arrived at the same time. Please try again.' },
      409,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
