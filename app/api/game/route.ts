import {
  authenticatedRead,
  read,
  save,
  json,
  errorResponse,
  checkOrigin,
} from '@/lib/game/store';
import { tick, execute, requireThat } from '@/lib/game/engine';
import { view } from '@/lib/game/view';
import { canApplyLatest, canApplyUnchangedEdit } from '@/lib/game/concurrency';
import { syncResult, syncMvp, voidResult } from '@/lib/social/results';
import { prepareProgression } from '@/lib/social/start';
export async function GET(r: Request) {
  try {
    const initial = await authenticatedRead(r);
    const { actor, code } = initial;
    for (let i = 0; i < 8; i++) {
      const { game, version, created } = i === 0 ? initial : await read(code);
      if (
        !actor.host &&
        !game.players.some((p) => p.id === actor.id && !p.departed)
      )
        throw Error('AUTH');
      const now = Date.now();
      const changed = tick(game, now);
      if (changed && !(await save(game, version))) continue;
      // A timer may end a game during a poll. Ordinary polls must stay read-only;
      // action handlers synchronize results and MVP changes when they save.
      if (changed && game.phase === 'ended')
        await syncResult(
          game,
          game.gameStartedAt ?? created,
          now,
          version + Number(changed),
        );
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
    const initial = await authenticatedRead(r);
    const { actor, code } = initial;
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
      const { game, version, created } = i === 0 ? initial : await read(code);
      const now = Date.now();
      const before = game.phase;
      const resultStarted = game.gameStartedAt ?? created;
      const pov =
        actor.host && game.sandbox
          ? game.players.find((p) => p.id === c.pov && p.dummy)
          : null;
      const actionActor = pov ? { id: pov.id, host: false } : actor;
      const canRebase = canApplyLatest(actionActor, c);
      if (tick(game, now)) {
        if (!(await save(game, version))) continue;
        if (canRebase || (actionActor.host && c.action === 'edit' && c.base)) continue;
        return json({ error: 'The timer advanced the game. Review the current phase.' }, 409);
      }
      if (
        ![
          'vote',
          'chat',
          'nightChoice',
          'mvpVote',
          'claimSeat',
          'leaveSeat',
          'saveNotebook',
          'returnLobby',
        ].includes(c.action) &&
        c.version !== version && !canRebase && !canApplyUnchangedEdit(game, actionActor, c)
      )
        return json(
          { error: 'The table changed. Review this action again.' },
          409,
        );
      if (c.action === 'returnLobby' && before === 'ended')
        await syncResult(game, game.gameStartedAt ?? created, now, version);
      const summary = execute(game, actionActor, c, now);
      if (c.action === 'start') await prepareProgression(game);
      if (c.preview) return json({ summary, version });
      if (!(await save(game, version))) continue;
      // Record the result when the game ends; withdraw it if the Storyteller
      // rewinds out of the ended phase. Both are idempotent.
      if (
        before === 'ended' &&
        game.phase !== 'ended' &&
        c.action !== 'returnLobby'
      )
        await voidResult(code, resultStarted, version + 1);
      else if (
        c.action !== 'returnLobby' &&
        (game.phase === 'ended' || before === 'ended')
      )
        await syncResult(
          game,
          game.gameStartedAt ?? created,
          now,
          version + 1,
          true,
        );
      if (c.action === 'mvpVote' || c.action === 'returnLobby')
        await syncMvp(game, version + 1);
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
