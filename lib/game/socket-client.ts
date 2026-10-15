import {
  parseHello,
  parseViewEnvelope,
  type ViewEnvelope,
  type ActionAck,
} from './socket-protocol.ts';
import type { Command } from './types.ts';
export const FALLBACK_POLL_MS = 30_000;
export type ConnectionPhase =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'offline';
type Transport = Pick<
  WebSocket,
  | 'readyState'
  | 'send'
  | 'close'
  | 'onopen'
  | 'onclose'
  | 'onerror'
  | 'onmessage'
>;
export type ConnectionOptions = {
  code: string;
  me: string;
  connect: () => Transport;
  poll: () => Promise<void>;
  view: (frame: ViewEnvelope) => void;
  status: (open: boolean) => void;
  phase?: (phase: ConnectionPhase) => void;
  version?: () => number;
  /** FEAR-121: the server's build and protocol (hello and view frames). */
  protocol?: (notice: { buildId?: string; apiVersion?: number }) => void;
  /** FEAR-120: X-Fearville-Client value, sent in the hello frame. */
  client?: () => string;
  random?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};
type PendingAction = {
  command: Command;
  promise: Promise<ActionAck>;
  resolve: (ack: ActionAck) => void;
  reject: (error: Error) => void;
};
export function reconnectDelay(failures: number, random = Math.random()) {
  return (
    Math.min(5000, 250 * 2 ** Math.min(failures, 5)) * (0.8 + random * 0.2)
  );
}
// A single ordered queue retains ids until ack, including when a socket dies
// after commit. It waits for a current authorized view before replaying.
export class TableConnection {
  private options: ConnectionOptions;
  private socket?: Transport;
  private stopped = true;
  private open = false;
  private failures = 0;
  private version = 0;
  private polling = false;
  private recovering = false;
  private pending = new Map<string, PendingAction>();
  private inFlight?: string;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private actionTimer?: ReturnType<typeof setTimeout>;
  private bannerTimer?: ReturnType<typeof setTimeout>;
  private offlineTimer?: ReturnType<typeof setTimeout>;
  constructor(options: ConnectionOptions) {
    this.options = options;
  }
  // Headless clients can learn their seat from the authenticated handshake.
  // A browser's known identity can never be replaced by a received frame.
  setIdentity(me: string) {
    if (!this.options.me && typeof me === 'string' && me) this.options.me = me;
  }
  private setTimer(fn: () => void, ms: number) {
    return (this.options.setTimer ?? setTimeout)(fn, ms);
  }
  private clearTimer(timer?: ReturnType<typeof setTimeout>) {
    if (timer !== undefined) (this.options.clearTimer ?? clearTimeout)(timer);
  }
  start() {
    this.stopped = false;
    this.offline();
    void this.poll();
    if (this.options.code) this.connect();
  }
  private async poll() {
    this.clearTimer(this.pollTimer);
    this.pollTimer = undefined;
    if (this.stopped || this.polling) return;
    this.polling = true;
    try {
      await this.options.poll();
    } catch {
      /* parent reports HTTP errors */
    } finally {
      this.polling = false;
      if (!this.stopped && !this.open)
        this.pollTimer = this.setTimer(
          () => void this.poll(),
          FALLBACK_POLL_MS,
        );
    }
  }
  private connect() {
    if (this.stopped || !this.options.code) return;
    this.clearTimer(this.retryTimer);
    let socket: Transport;
    try {
      socket = this.options.connect();
    } catch {
      this.down();
      return;
    }
    this.socket = socket;
    this.handshakeTimer = this.setTimer(() => {
      if (!this.open) {
        this.detach();
        this.down();
      }
    }, 10000);
    socket.onopen = () => {
      if (this.stopped || this.socket !== socket) return;
      try {
        socket.send(
          JSON.stringify({
            type: 'hello',
            lastVersion: Math.max(this.version, this.options.version?.() ?? 0),
            ...(this.options.client ? { client: this.options.client() } : {}),
          }),
        );
      } catch {
        this.detach();
        this.down();
      }
    };
    socket.onmessage = (event) => {
      if (
        this.stopped ||
        this.socket !== socket ||
        typeof event.data !== 'string'
      )
        return;
      try {
        const ack = JSON.parse(event.data) as ActionAck;
        const pending =
          ack.type === 'ack' &&
          typeof ack.ok === 'boolean' &&
          ack.id === this.inFlight
            ? this.pending.get(ack.id)
            : undefined;
        if (pending) {
          this.clearTimer(this.actionTimer);
          this.inFlight = undefined;
          this.pending.delete(ack.id);
          pending.resolve(ack);
          this.flush();
          return;
        }
      } catch {
        /* malformed frames never settle an action */
      }
      const hello = parseHello(event.data);
      if (hello) {
        this.options.protocol?.(hello);
        return;
      }
      const frame = parseViewEnvelope(
        event.data,
        this.options.code,
        this.options.me,
      );
      if (frame?.apiVersion !== undefined)
        this.options.protocol?.({ apiVersion: frame.apiVersion });
      if (!frame || frame.version < this.version) return;
      this.version = frame.version;
      this.options.view(frame);
      if (!this.open) {
        this.clearTimer(this.handshakeTimer);
        this.clearTimer(this.pollTimer);
        this.pollTimer = undefined;
        this.clearTimer(this.bannerTimer);
        this.clearTimer(this.offlineTimer);
        this.open = true;
        this.recovering = false;
        this.failures = 0;
        this.options.status(true);
        this.options.phase?.('live');
        this.flush();
      }
    };
    socket.onclose = socket.onerror = () => {
      if (this.socket !== socket || this.stopped) return;
      this.detach();
      this.down();
    };
  }
  private detach() {
    this.clearTimer(this.handshakeTimer);
    this.clearTimer(this.actionTimer);
    this.inFlight = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
      socket.close();
    }
  }
  private offline() {
    if (this.recovering) return;
    this.recovering = true;
    this.options.phase?.('connecting');
    this.bannerTimer = this.setTimer(
      () => this.options.phase?.('reconnecting'),
      1000,
    );
    this.offlineTimer = this.setTimer(
      () => this.options.phase?.('offline'),
      15000,
    );
  }
  private down() {
    if (this.stopped) return;
    const wasOpen = this.open;
    this.open = false;
    this.options.status(false);
    this.offline();
    if (wasOpen || (!this.polling && this.pollTimer === undefined))
      void this.poll();
    this.clearTimer(this.retryTimer);
    this.retryTimer = this.setTimer(
      () => this.connect(),
      reconnectDelay(this.failures++, this.options.random?.()),
    );
  }
  resume() {
    if (this.stopped) return;
    // A backgrounded phone can report OPEN for a dead socket. Replace it even
    // when readyState still says open, and reuse its cookie/seat identity.
    this.detach();
    this.open = false;
    this.options.status(false);
    this.offline();
    void this.poll();
    this.connect();
  }
  stop() {
    this.stopped = true;
    for (const timer of [
      this.pollTimer,
      this.retryTimer,
      this.bannerTimer,
      this.offlineTimer,
    ])
      this.clearTimer(timer);
    this.detach();
    for (const pending of this.pending.values())
      pending.reject(Error('Table connection closed.'));
    this.pending.clear();
  }
  send(command: Command, id: string): Promise<ActionAck> | null {
    if (this.stopped || !this.options.code) return null;
    const existing = this.pending.get(id);
    if (existing) return existing.promise;
    if (this.pending.size >= 100)
      return Promise.reject(
        Error('Too many pending actions. Reconnect before continuing.'),
      );
    let resolve!: PendingAction['resolve'], reject!: PendingAction['reject'];
    const promise = new Promise<ActionAck>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    this.pending.set(id, {
      command: structuredClone(command),
      promise,
      resolve,
      reject,
    });
    this.flush();
    return promise;
  }
  private flush() {
    if (
      !this.open ||
      this.inFlight ||
      !this.socket ||
      this.socket.readyState !== 1
    )
      return;
    const next = this.pending.entries().next().value;
    if (!next) return;
    const [id, pending] = next;
    this.inFlight = id;
    this.actionTimer = this.setTimer(() => {
      this.detach();
      this.down();
    }, 10000);
    try {
      this.socket.send(
        JSON.stringify({ type: 'action', id, command: pending.command }),
      );
    } catch {
      this.detach();
      this.down();
    }
  }
}
