import { DurableObject } from 'cloudflare:workers';
import { database } from '@/db';
import { tick, requireThat, nextDeadline } from '../engine';
import { tableView } from '../visible-view';
import { type ActionAck } from '../socket-protocol';
import { riteView } from '../../rite/view';
import { renameMember, removeMember } from '../membership';
import { joinSessionD1 } from '../join';
import type { ProfileDefaults } from '../../accounts/preferences';
import { SerialQueue } from '../serial';
import { ObjectParts, type TableMeta } from '../object-storage';
import type { Actor, Command, Game } from '../types';
import { type TableContext } from './context.ts';
import {
  authenticateMethod,
  importD1Method,
  currentMethod,
  scheduleMethod,
  destroyMethod,
} from './storage.ts';
import {
  flushProjectionMethod,
  flushEffectsMethod,
  commitMethod,
} from './persistence.ts';
import { actionMethod } from './actions.ts';
import {
  publishMethod,
  broadcastMethod,
  fetchMethod,
  webSocketMessageMethod,
} from './sockets.ts';
export class GameTable extends DurableObject {
  private queue = new SerialQueue();
  private pushes = new SerialQueue();
  private parts: ObjectParts;
  private game?: Game;
  private meta?: TableMeta;
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.parts = new ObjectParts(ctx.storage);
  }
  private async authenticate(
    actor: Actor,
    code: string,
    communication = false,
  ): Promise<void> {
    return authenticateMethod.call(this.context(), actor, code, communication);
  }
  private async importD1(code: string, reset = false): Promise<void> {
    return importD1Method.call(this.context(), code, reset);
  }
  private async current(code: string, actor?: Actor): Promise<Game> {
    return currentMethod.call(this.context(), code, actor);
  }
  private async schedule(): Promise<void> {
    return scheduleMethod.call(this.context());
  }
  private async destroy(): Promise<void> {
    return destroyMethod.call(this.context());
  }
  private async flushProjection(): Promise<void> {
    return flushProjectionMethod.call(this.context());
  }
  private async flushEffects(): Promise<void> {
    return flushEffectsMethod.call(this.context());
  }
  private async commit(
    next: Game,
    actor: Actor | undefined,
    action: string,
    now: number,
    removed?: string,
    cause?: string,
    receipt?: { seat: string; ack: ActionAck },
  ): Promise<void> {
    return commitMethod.call(
      this.context(),
      next,
      actor,
      action,
      now,
      removed,
      cause,
      receipt,
    );
  }
  read(code: string, actor?: Actor) {
    return this.queue.run(async () => {
      const current = await this.current(code, actor);
      return {
        game: structuredClone(current),
        version: this.meta!.version,
        created: this.meta!.created,
      };
    });
  }
  private viewer(g: Game, actor: Actor, pov: unknown) {
    const player =
      actor.host && g.sandbox
        ? g.players.find((p) => p.id === pov && p.dummy && !p.departed)
        : null;
    return player ? { id: player.id, host: false } : actor;
  }
  action(code: string, actor: Actor, c: Command, rite = false) {
    return actionMethod.call(this.context(), code, actor, c, rite);
  }
  private remember(seat: string, ack: ActionAck) {
    this.meta!.receipts = {
      ...this.meta!.receipts,
      [seat]: [...(this.meta!.receipts?.[seat] ?? []), ack].slice(-100),
    };
    this.parts.save(this.game!, this.meta!);
  }
  private async actionReply(
    code: string,
    actor: Actor,
    c: Command,
    rite: boolean,
    ack: ActionAck,
  ) {
    if (!ack.ok) return { error: ack.error, status: ack.status ?? 400 };
    if (c.preview) return { summary: ack.summary, version: ack.version };
    const now = Date.now(),
      viewer = this.viewer(this.game!, actor, c.pov);
    return rite
      ? {
          code,
          me: viewer.id,
          rite: riteView(this.game!, viewer, now),
          version: this.meta!.version,
          serverNow: now,
          summary: ack.summary,
        }
      : {
          summary: ack.summary,
          game: await tableView(
            this.game!,
            viewer,
            this.meta!.version,
            now,
            !!this.game!.sandbox && actor.host,
            actor.id,
            c.compactRecaps === true,
          ),
        };
  }
  join(
    code: string,
    name: string,
    tokenHash: string,
    invitation?: { id: string; account: string; sender: string; now: number },
    defaults?: ProfileDefaults,
  ) {
    return this.queue.run(async () => {
      await this.current(code);
      const joined = await joinSessionD1(
        code,
        name,
        tokenHash,
        invitation,
        defaults,
      );
      if (joined) await this.importD1(code);
      return joined;
    });
  }
  session(code: string, actor: Actor, c: Command) {
    return this.queue.run(async () => {
      const current = await this.current(code, actor);
      const g = structuredClone(current),
        now = Date.now();
      if (c.action === 'deleteLobby') {
        requireThat(actor.host, 'Only the Storyteller can delete the lobby.');
        requireThat(g.phase === 'lobby', 'Only a lobby can be deleted.');
        await database()
          .prepare('DELETE FROM sessions WHERE code=?')
          .bind(code)
          .run();
        await this.destroy();
        return;
      }
      let removed = '';
      if (c.action === 'rename') renameMember(g, actor, c.name, now);
      else {
        requireThat(
          c.action === 'remove' || c.action === 'leaveLobby',
          'Unknown session action.',
        );
        requireThat(
          c.action !== 'remove' || actor.host,
          'Only the Storyteller can remove players.',
        );
        if (c.action === 'leaveLobby') {
          requireThat(
            !actor.host,
            'The Storyteller can delete the lobby instead.',
          );
          requireThat(
            g.phase === 'lobby' || g.phase === 'ended',
            'Finish the game or return to the lobby before leaving it.',
          );
        }
        removed = removeMember(
          g,
          actor,
          c.action === 'leaveLobby' ? actor.id : c.player,
          now,
        );
      }
      await this.commit(g, actor, c.action, now, removed);
    });
  }
  async alarm() {
    return this.queue.run(async () => {
      const restored = this.meta ?? this.parts.load()?.meta;
      if (!restored) return;
      await this.current(restored.code);
      if (Date.now() >= this.meta!.retainAt) {
        await database()
          .prepare('DELETE FROM sessions WHERE code=?')
          .bind(restored.code)
          .run();
        await this.destroy();
      } else {
        const now = Date.now(),
          due = nextDeadline(this.game!, this.meta!.timerThrough ?? 0);
        const next = structuredClone(this.game!);
        const changed = tick(next, now);
        this.meta!.timerThrough = now;
        if (changed || (due !== null && due <= now))
          await this.commit(next, undefined, 'alarm', now);
        else {
          this.parts.save(this.game!, this.meta!);
          await this.schedule();
        }
      }
    });
  }
  private publish(cause?: string, committedAt?: number): void {
    return publishMethod.call(this.context(), cause, committedAt);
  }
  private async broadcast(
    game: Game,
    version: number,
    cause?: string,
    committedAt?: number,
  ): Promise<void> {
    return broadcastMethod.call(
      this.context(),
      game,
      version,
      cause,
      committedAt,
    );
  }
  fetch(r: Request) {
    return fetchMethod.call(this.context(), r);
  }
  async webSocketMessage(
    socket: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    return webSocketMessageMethod.call(this.context(), socket, message);
  }
  private acknowledge(socket: WebSocket, ack: unknown) {
    try {
      socket.send(JSON.stringify(ack));
    } catch {
      /* Dropped after commit: the receipt is replayed on reconnect. */
    }
  }
  webSocketClose(socket: WebSocket) {
    socket.close(1000, 'Connection closed.');
  }
  webSocketError(socket: WebSocket) {
    socket.close(1011, 'Reconnect to the table.');
  }
  notify(code: string) {
    return this.queue.run(async () => {
      try {
        await this.current(code);
        this.publish();
      } catch (e) {
        if (e instanceof Error && e.message === 'Session not found.') return;
        throw e;
      }
    });
  }

  // The adapters retain this instance and its private state when invoking moved methods.
  private context(): TableContext {
    return this as unknown as TableContext;
  }
}
