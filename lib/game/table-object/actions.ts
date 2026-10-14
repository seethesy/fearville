import { loadDecision, errorResponse } from '../store';
import { execute, tick, snapshot, requireThat } from '../engine';
import { riteAction, tickRite } from '../../rite/engine';
import { tableView } from '../visible-view';
import { actionID, normalizeCommand, type ActionAck } from '../socket-protocol';
import { riteView } from '../../rite/view';
import { canApplyLatest, canApplyUnchangedEdit } from '../concurrency';
import { prepareProgression } from '../../social/start';
import { syncResult } from '../../social/results';
import type { Actor, Command } from '../types';
import { type TableContext } from './context.ts';
export function actionMethod(
  this: TableContext,
  code: string,
  actor: Actor,
  c: Command,
  rite = false,
) {
  return this.queue.run(async () => {
    await this.current(code, actor);
    c = normalizeCommand(c);
    const id = actionID(c.requestId) ? c.requestId : undefined;
    const cached =
      id && this.meta!.receipts?.[actor.id]?.find((ack) => ack.id === id);
    if (cached) return this.actionReply(code, actor, c, rite, cached);
    try {
      const now = Date.now();
      const caughtUp = structuredClone(this.game!);
      if (tick(caughtUp, now)) await this.commit(caughtUp, actor, 'tick', now);
      const g = structuredClone(this.game!),
        version = this.meta!.version;
      const viewer = this.viewer(g, actor, c.pov);
      if (rite) {
        if (
          ['configureRite', 'riteForce', 'riteRedeal', 'ritePassTurn'].includes(
            c.action,
          )
        ) {
          requireThat(viewer.host, 'Only the Storyteller can do that.');
          if (c.epoch === undefined || c.night === undefined)
            requireThat(
              c.version === version,
              'The table changed. Refresh setup before saving.',
            );
          else
            requireThat(
              c.epoch === (g.rite?.epoch ?? '') && c.night === g.night,
              'This Rite action belongs to an earlier window.',
            );
          snapshot(g, 'Night Rite: ' + c.action, now);
        }
      } else if (
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
        c.version !== version &&
        !canApplyLatest(viewer, c) &&
        !canApplyUnchangedEdit(g, viewer, c)
      )
        throw Error('The table changed. Review this action again.');
      if (c.action === 'returnLobby' && g.phase === 'ended')
        await syncResult(
          g,
          g.gameStartedAt ?? this.meta!.created,
          now,
          version,
        );
      if (c.action === 'undo' || c.action === 'rewind') {
        const entry =
          c.action === 'undo'
            ? g.history.at(-1)
            : g.history.find((h) => h.id === c.history);
        if (entry) entry.before = this.parts.snapshot(entry.id);
        await loadDecision(g, c);
      }
      const summary = rite
        ? riteAction(g, viewer, c, now)
        : execute(g, viewer, c, now);
      requireThat(summary !== null, 'Choose a Rite action.');
      if (c.action === 'start') await prepareProgression(g);
      if (c.preview) {
        if (id)
          this.remember(actor.id, {
            type: 'ack',
            id,
            ok: true,
            summary,
            version,
          });
        return { summary, version };
      }
      // Preparing bank puzzles here avoids generators and writes on GET.
      tickRite(g, now);
      await this.commit(
        g,
        actor,
        c.action,
        now,
        undefined,
        id,
        id
          ? {
              seat: actor.id,
              ack: {
                type: 'ack',
                id,
                ok: true,
                summary,
                version: version + 1,
              },
            }
          : undefined,
      );
      return rite
        ? {
            code,
            me: viewer.id,
            rite: riteView(g, viewer, now),
            version: this.meta!.version,
            serverNow: now,
            summary,
          }
        : {
            summary,
            game: await tableView(
              g,
              viewer,
              this.meta!.version,
              now,
              !!g.sandbox && actor.host,
              actor.id,
              c.compactRecaps === true,
            ),
          };
    } catch (error) {
      // A persisted success survives projection/effect failures. Retrying
      // flushes those intents before returning the receipt, never executes twice.
      if (!id) {
        if (
          error instanceof Error &&
          error.message === 'The table changed. Review this action again.'
        )
          return { error: error.message, status: 409 };
        throw error;
      }
      if (this.meta!.receipts?.[actor.id]?.some((ack) => ack.id === id))
        throw error;
      const response = errorResponse(error);
      const body = (await response.json()) as { error: string };
      const ack: ActionAck = {
        type: 'ack',
        id,
        ok: false,
        error: body.error,
        status:
          body.error === 'The table changed. Review this action again.'
            ? 409
            : response.status,
      };
      this.remember(actor.id, ack);
      return { error: ack.error, status: ack.status };
    }
  });
}
