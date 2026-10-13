import { DurableObject } from 'cloudflare:workers';
import { database } from '@/db';
import { checkSeatAccount } from '@/lib/admin/access';
import { readD1, saveD1, loadDecision, hash, errorResponse } from './store';
import { inheritStored } from './part-store';
import { execute, tick, snapshot, requireThat, nextDeadline } from './engine';
import { riteAction, tickRite } from '../rite/engine';
import { tableView } from './visible-view';
import { view } from './view';
import { TABLE_API_VERSION, viewContent } from './socket-protocol';
import { BUILD_ID } from '../runtime/build';
import { allowlisted } from '../admin/policy';
import { adminAllowlist } from '../admin/access';
import { riteView } from '../rite/view';
import { canApplyLatest, canApplyUnchangedEdit } from './concurrency';
import { renameMember, removeMember } from './membership';
import { joinSessionD1 } from './join';
import { prepareProgression } from '../social/start';
import { syncResult, syncMvp, voidResult } from '../social/results';
import type { ProfileDefaults } from '../accounts/preferences';
import { SerialQueue } from './serial';
import { ObjectParts, type TableMeta } from './object-storage';
import type { Actor, Command, Game } from './types';

export const TABLE_RETENTION = 30 * 24 * 60 * 60 * 1000;
type SocketSeat = {
  actor: Actor;
  viewer: Actor;
  sandboxHost: boolean;
  hash?: string;
};
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
  ) {
    requireThat(actor.credentialHash, 'AUTH');
    const member = await database()
      .prepare(
        'SELECT player,host FROM members WHERE code=? AND token_hash=? AND expires>?',
      )
      .bind(code, actor.credentialHash, Date.now())
      .first<{ player: string; host: number }>();
    requireThat(
      member && member.player === actor.id && !!member.host === actor.host,
      'AUTH',
    );
    await checkSeatAccount(code, actor.id, communication);
    requireThat(
      actor.host ||
        this.game?.players.some((p) => p.id === actor.id && !p.departed),
      'AUTH',
    );
  }
  private async importD1(code: string, reset = false) {
    const loaded = await readD1(code);
    if (reset) this.parts.reset();
    this.game = loaded.game;
    this.meta = {
      code,
      version: loaded.version,
      created: loaded.created,
      retainAt: this.meta?.retainAt ?? Date.now() + TABLE_RETENTION,
    };
    // Compatibility admin/account transactions can redact snapshots in D1.
    // Import them on an external revision, so a rewind cannot restore PII.
    const snapshots = await database()
      .prepare('SELECT id,state FROM session_snapshots WHERE code=?')
      .bind(code)
      .all<{ id: string; state: string }>();
    const byID = new Map(snapshots.results.map((s) => [s.id, s.state]));
    for (const entry of this.game.history)
      entry.before ||= byID.get(entry.id) ?? '';
    this.parts.save(this.game, this.meta);
    for (const entry of this.game.history) entry.before = '';
    await this.schedule();
    this.publish();
  }
  private async current(code: string, actor?: Actor) {
    if (!this.game) {
      const restored = this.parts.load();
      if (restored) {
        this.game = restored.game;
        this.meta = restored.meta;
        const projection = await readD1(code);
        inheritStored(projection.game, this.game);
      } else await this.importD1(code);
    }
    requireThat(this.meta?.code === code, 'Session not found.');
    if (this.meta!.projection) await this.flushProjection();
    // D1 remains the account/admin compatibility projection during migration.
    // Ordinary requests load only this small revision, never all the parts.
    const indexed = await database()
      .prepare('SELECT version FROM sessions WHERE code=?')
      .bind(code)
      .first<{ version: number }>();
    if (!indexed) {
      await this.destroy();
      throw Error('Session not found.');
    }
    if (indexed.version !== this.meta!.version) await this.importD1(code, true);
    if (actor) await this.authenticate(actor, code);
    await this.flushEffects();
    return this.game!;
  }
  private async schedule() {
    if (this.meta)
      await this.ctx.storage.setAlarm(
        Math.min(
          this.meta.retainAt,
          nextDeadline(this.game!, this.meta.timerThrough ?? 0) ??
            this.meta.retainAt,
          this.meta.projection || this.meta.effects
            ? Date.now() + 2000
            : this.meta.retainAt,
        ),
      );
  }
  private async destroy() {
    for (const socket of this.ctx.getWebSockets())
      socket.close(1001, 'Table closed.');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.parts = new ObjectParts(this.ctx.storage);
    this.game = undefined;
    this.meta = undefined;
  }
  private async flushProjection() {
    const projection = this.meta?.projection;
    if (!projection) return;
    const indexed = await database()
      .prepare('SELECT write_id FROM sessions WHERE code=?')
      .bind(this.meta!.code)
      .first<{ write_id: string | null }>();
    // The D1 transaction may have committed immediately before an eviction.
    // Its durable operation id makes replay (including revocation) idempotent.
    try {
      if (
        indexed?.write_id !== projection.id &&
        !(await saveD1(
          this.game!,
          projection.version,
          projection.syncRanked,
          projection.credentialHash,
          projection.communication,
          (guard, bindings) =>
            projection.removed
              ? ['members', 'account_seats'].map((name) =>
                  database()
                    .prepare(
                      `DELETE FROM ${name} WHERE code=? AND player=? AND ${guard}`,
                    )
                    .bind(this.meta!.code, projection.removed!, ...bindings),
                )
              : [],
          projection.id,
        ))
      ) {
        // A concurrent admin revocation wins. Never publish a rejected write.
        await this.importD1(this.meta!.code, true);
        throw Error(
          'The table was updated by administration. Refresh before continuing.',
        );
      }
    } catch (error) {
      // A competing table may acquire a ranked account after eligibility was
      // checked. This is a rejected start, not a transient projection outage:
      // discard its durable intent so it cannot start later on a retry.
      if (
        error instanceof Error &&
        error.message.includes('already playing another ranked game')
      )
        await this.importD1(this.meta!.code, true);
      throw error;
    }
    delete this.meta!.projection;
    this.parts.save(this.game!, this.meta!);
    for (const entry of this.game!.history) entry.before = '';
    // On D1 outage the projection intent remains durable for alarm/request retry.
  }
  private async flushEffects() {
    const effects = this.meta?.effects;
    if (!effects) return;
    const g = this.game!,
      version = this.meta!.version;
    if (
      effects.before === 'ended' &&
      g.phase !== 'ended' &&
      effects.action !== 'returnLobby'
    )
      await voidResult(g.code, effects.started, version);
    else if (
      effects.action !== 'returnLobby' &&
      (g.phase === 'ended' || effects.before === 'ended')
    )
      await syncResult(
        g,
        g.gameStartedAt ?? this.meta!.created,
        effects.now,
        version,
        true,
      );
    if (effects.action === 'mvpVote' || effects.action === 'returnLobby')
      await syncMvp(g, version);
    delete this.meta!.effects;
    this.parts.save(g, this.meta!);
  }
  private async commit(
    next: Game,
    actor: Actor | undefined,
    action: string,
    now: number,
    removed?: string,
    cause?: string,
  ) {
    const before = this.game!,
      oldMeta = this.meta!;
    if (actor) await this.authenticate(actor, next.code, action === 'chat');
    inheritStored(before, next);
    const meta: TableMeta = {
      ...oldMeta,
      version: oldMeta.version + 1,
      retainAt: now + TABLE_RETENTION,
      projection: {
        id: crypto.randomUUID(),
        version: oldMeta.version,
        credentialHash: actor?.credentialHash,
        communication: action === 'chat',
        removed,
        syncRanked:
          JSON.stringify([
            before.ranked,
            before.progression,
            before.gameStartedAt,
            before.phase === 'lobby',
            before.phase === 'ended',
          ]) !==
          JSON.stringify([
            next.ranked,
            next.progression,
            next.gameStartedAt,
            next.phase === 'lobby',
            next.phase === 'ended',
          ]),
      },
      effects: {
        before: before.phase,
        started: before.gameStartedAt ?? oldMeta.created,
        action,
        now,
      },
    };
    this.parts.save(next, meta);
    this.game = next;
    this.meta = meta;
    await this.schedule();
    await this.flushProjection();
    await this.flushEffects();
    await this.schedule();
    this.publish(cause);
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
    return this.queue.run(async () => {
      await this.current(code, actor);
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
        return {
          error: 'The table changed. Review this action again.',
          status: 409,
        };
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
      if (c.preview) return { summary, version };
      // Preparing bank puzzles here avoids generators and writes on GET.
      tickRite(g, now);
      await this.commit(
        g,
        actor,
        c.action,
        now,
        undefined,
        typeof c.requestId === 'string' && c.requestId.length < 100
          ? c.requestId
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
    });
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
  private publish(cause?: string) {
    if (!this.game || !this.meta || !this.ctx.getWebSockets().length) return;
    const game = structuredClone(this.game),
      version = this.meta.version;
    this.ctx.waitUntil(
      this.pushes
        .run(() => this.broadcast(game, version, cause))
        .catch(() => {
          for (const socket of this.ctx.getWebSockets())
            try {
              socket.close(1011, 'Reconnect to the table.');
            } catch {
              /* already closed */
            }
        }),
    );
  }
  private async broadcast(game: Game, version: number, cause?: string) {
    const db = database();
    const [index, members, blocks] = await Promise.all([
      db
        .prepare('SELECT version FROM sessions WHERE code=?')
        .bind(game.code)
        .first<{ version: number }>(),
      db
        .prepare(
          'SELECT m.token_hash,m.player,m.host,m.expires,a.role,a.banned,a.google_email,a.email FROM members m LEFT JOIN account_seats s ON s.code=m.code AND s.player=m.player LEFT JOIN accounts a ON a.id=s.account WHERE m.code=?',
        )
        .bind(game.code)
        .all<{
          token_hash: string;
          player: string;
          host: number;
          expires: number;
          role: string | null;
          banned: string | null;
          google_email: string | null;
          email: string | null;
        }>(),
      db
        .prepare(
          "SELECT me.player AS viewer,b.player FROM account_seats me JOIN friendships f ON f.requester=me.account AND f.status='blocked' JOIN account_seats b ON b.account=f.addressee AND b.code=me.code WHERE me.code=?",
        )
        .bind(game.code)
        .all<{ viewer: string; player: string }>(),
    ]);
    if (!index) {
      for (const socket of this.ctx.getWebSockets())
        socket.close(1001, 'Table closed.');
      return;
    }
    if (index.version !== version) return; // a newer queued push contains these changes
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      try {
        const seat = socket.deserializeAttachment() as SocketSeat;
        const credentials = members.results.filter(
          (m) => m.token_hash === seat.actor.credentialHash,
        );
        if (
          !credentials.length ||
          credentials.some(
            (m) =>
              m.player !== seat.actor.id ||
              !!m.host !== seat.actor.host ||
              m.expires <= now ||
              m.banned !== null ||
              (m.role !== null && m.role !== 'player') ||
              allowlisted(m.google_email || m.email || '', adminAllowlist()),
          ) ||
          (!seat.actor.host &&
            !game.players.some((p) => p.id === seat.actor.id && !p.departed))
        ) {
          socket.close(1008, 'Session expired.');
          continue;
        }
        const hidden = blocks.results
          .filter((b) => b.viewer === seat.actor.id)
          .map((b) => b.player);
        const filtered = {
          ...game,
          messages: game.messages.filter(
            (m) => !(m.kind === 'chat' && hidden.includes(m.from)),
          ),
        };
        const data = {
          ...view(filtered, seat.viewer, version, now, seat.sandboxHost, true),
          blockedChatSenders: hidden,
        };
        const fingerprint = await hash(viewContent(data));
        if (fingerprint === seat.hash) continue;
        socket.send(
          JSON.stringify({
            type: 'view',
            version,
            serverNow: now,
            data,
            ...(cause ? { cause } : {}),
          }),
        );
        socket.serializeAttachment({ ...seat, hash: fingerprint });
      } catch {
        try {
          socket.close(1011, 'Reconnect to the table.');
        } catch {
          /* socket already closed */
        }
      }
    }
  }
  fetch(r: Request) {
    return this.queue.run(async () => {
      try {
        requireThat(
          r.headers.get('upgrade')?.toLowerCase() === 'websocket',
          'WebSocket upgrade required.',
        );
        const code = r.headers.get('X-Table-Code') || '';
        const actor = JSON.parse(
          r.headers.get('X-Table-Actor') || '{}',
        ) as Actor;
        const game = await this.current(code, actor);
        const viewer = this.viewer(
          game,
          actor,
          new URL(r.url).searchParams.get('pov'),
        );
        const pair = new WebSocketPair(),
          client = pair[0],
          server = pair[1];
        const sandboxHost = !!game.sandbox && actor.host;
        this.ctx.acceptWebSocket(server, [actor.id]);
        server.serializeAttachment({
          actor,
          viewer,
          sandboxHost,
        } satisfies SocketSeat);
        server.send(
          JSON.stringify({
            type: 'hello',
            buildId: BUILD_ID,
            apiVersion: TABLE_API_VERSION,
          }),
        );
        const now = Date.now(),
          version = this.meta!.version;
        const data = await tableView(
          game,
          viewer,
          version,
          now,
          sandboxHost,
          actor.id,
          true,
        );
        server.send(
          JSON.stringify({ type: 'view', version, serverNow: now, data }),
        );
        server.serializeAttachment({
          actor,
          viewer,
          sandboxHost,
          hash: await hash(viewContent(data)),
        } satisfies SocketSeat);
        return new Response(null, { status: 101, webSocket: client });
      } catch (e) {
        return errorResponse(e);
      }
    });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') socket.send('pong');
    else socket.close(1008, 'Use HTTP for table actions.');
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
}
