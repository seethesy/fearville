import { database } from '@/db';
import { hash, errorResponse, limited } from '../store';
import { requireThat } from '../engine';
import { tableView } from '../visible-view';
import { view } from '../view';
import {
  TABLE_API_VERSION,
  viewContent,
  actionID,
  normalizeCommand,
} from '../socket-protocol';
import { BUILD_ID } from '../../runtime/build';
import { allowlisted } from '../../admin/policy';
import { adminAllowlist } from '../../admin/access';
import type { Actor, Game } from '../types';
import { type TableContext, type SocketSeat } from './context.ts';
export function publishMethod(
  this: TableContext,
  cause?: string,
  committedAt?: number,
): void {
  if (!this.game || !this.meta || !this.ctx.getWebSockets().length) return;
  const game = structuredClone(this.game),
    version = this.meta.version;
  this.ctx.waitUntil(
    this.pushes
      .run(() => this.broadcast(game, version, cause, committedAt))
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
export async function broadcastMethod(
  this: TableContext,
  game: Game,
  version: number,
  cause?: string,
  committedAt?: number,
): Promise<void> {
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
          ...(committedAt !== undefined ? { committedAt } : {}),
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
export function fetchMethod(this: TableContext, r: Request) {
  return this.queue.run(async () => {
    try {
      requireThat(
        r.headers.get('upgrade')?.toLowerCase() === 'websocket',
        'WebSocket upgrade required.',
      );
      const code = r.headers.get('X-Table-Code') || '';
      const actor = JSON.parse(r.headers.get('X-Table-Actor') || '{}') as Actor;
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
        code,
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
        code,
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
export async function webSocketMessageMethod(
  this: TableContext,
  socket: WebSocket,
  message: string | ArrayBuffer,
): Promise<void> {
  if (message === 'ping') {
    socket.send('pong');
    return;
  }
  let id: string | undefined;
  try {
    requireThat(
      typeof message === 'string' && message.length < 20000,
      'Request is too large.',
    );
    const frame = JSON.parse(message as string);
    if (frame.type === 'ping' && actionID(frame.id)) {
      socket.send(
        JSON.stringify({ type: 'pong', id: frame.id, serverNow: Date.now() }),
      );
      return;
    }
    if (frame.type === 'hello') {
      requireThat(
        Number.isSafeInteger(frame.lastVersion) && frame.lastVersion >= 0,
        'Invalid table version.',
      );
      await this.queue.run(async () => {
        const seat = socket.deserializeAttachment() as SocketSeat;
        const code =
          seat.code ?? this.meta?.code ?? this.parts.load()?.meta.code;
        requireThat(code, 'AUTH');
        const game = await this.current(code!, seat.actor),
          now = Date.now(),
          version = this.meta!.version;
        const data = await tableView(
          game,
          seat.viewer,
          version,
          now,
          seat.sandboxHost,
          seat.actor.id,
          true,
        );
        socket.send(
          JSON.stringify({ type: 'view', version, serverNow: now, data }),
        );
        socket.serializeAttachment({
          ...seat,
          code,
          hash: await hash(viewContent(data)),
        });
      });
      return;
    }
    requireThat(
      frame.type === 'action' && actionID(frame.id),
      'Choose an action.',
    );
    id = frame.id;
    const seat = socket.deserializeAttachment() as SocketSeat;
    await limited(
      new Request('https://table.internal/action', {
        headers: { 'cf-connecting-ip': seat.actor.credentialHash! },
      }),
      'table-action',
      600,
    );
    const command = {
      ...normalizeCommand(frame.command),
      requestId: id,
      compactRecaps: true,
      pov: seat.sandboxHost ? seat.viewer.id : undefined,
    };
    const result = await this.action(
      seat.code ?? this.meta?.code ?? this.parts.load()!.meta.code,
      seat.actor,
      command,
      command.action === 'configureRite' || command.action.startsWith('rite'),
    );
    const failed = 'error' in result && !!result.error;
    this.acknowledge(socket, {
      type: 'ack',
      id,
      ok: !failed,
      error: 'error' in result ? result.error : undefined,
      status: 'status' in result ? result.status : undefined,
      summary: 'summary' in result ? result.summary : undefined,
      data: result,
      serverNow: Date.now(),
      committedAt: this.meta!.receipts?.[seat.actor.id]?.find(
        (ack) => ack.id === id,
      )?.committedAt,
      version:
        'game' in result
          ? result.game?.version
          : 'version' in result
            ? result.version
            : this.meta!.version,
    });
  } catch (error) {
    if (!id) {
      socket.close(1008, 'Invalid table message.');
      return;
    }
    const response = errorResponse(error);
    const body = (await response.json()) as { error: string };
    this.acknowledge(socket, {
      type: 'ack',
      id,
      ok: false,
      ...body,
      status: response.status,
    });
  }
}
