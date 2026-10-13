import { parseViewEnvelope, type ViewEnvelope } from './socket-protocol.ts';
export const FALLBACK_POLL_MS = 30_000;
type Transport = Pick<
  WebSocket,
  'readyState' | 'close' | 'onopen' | 'onclose' | 'onerror' | 'onmessage'
>;
export type ConnectionOptions = {
  code: string;
  me: string;
  connect: () => Transport;
  poll: () => Promise<void>;
  view: (frame: ViewEnvelope) => void;
  status: (open: boolean) => void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};
// Kept outside React so fallback/recovery behavior can be tested with a fake
// transport and clock, including close/error during an in-flight HTTP poll.
export class TableConnection {
  private options: ConnectionOptions;
  private socket?: Transport;
  private stopped = true;
  private open = false;
  private failures = 0;
  private polling = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  constructor(options: ConnectionOptions) {
    this.options = options;
  }
  private setTimer(fn: () => void, ms: number) {
    return (this.options.setTimer ?? setTimeout)(fn, ms);
  }
  private clearTimer(timer?: ReturnType<typeof setTimeout>) {
    if (timer !== undefined) (this.options.clearTimer ?? clearTimeout)(timer);
  }
  start() {
    this.stopped = false;
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
    if (this.stopped) return;
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
    }, 10_000);
    socket.onopen = () => {
      if (this.stopped || this.socket !== socket) return;
      this.clearTimer(this.handshakeTimer);
      this.clearTimer(this.pollTimer);
      this.pollTimer = undefined;
      this.open = true;
      this.failures = 0;
      this.options.status(true);
    };
    socket.onmessage = (event) => {
      if (
        this.stopped ||
        this.socket !== socket ||
        typeof event.data !== 'string'
      )
        return;
      const frame = parseViewEnvelope(
        event.data,
        this.options.code,
        this.options.me,
      );
      if (frame) this.options.view(frame);
    };
    socket.onclose = socket.onerror = () => {
      if (this.socket !== socket || this.stopped) return;
      this.detach();
      this.down();
    };
  }
  private detach() {
    this.clearTimer(this.handshakeTimer);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
      socket.close();
    }
  }
  private down() {
    if (this.stopped) return;
    const wasOpen = this.open;
    this.open = false;
    this.options.status(false);
    if (wasOpen || (!this.polling && this.pollTimer === undefined))
      void this.poll();
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.failures++, 4));
    this.retryTimer = this.setTimer(() => this.connect(), delay);
  }
  resume() {
    if (this.stopped) return;
    void this.poll();
    if (!this.socket || this.socket.readyState !== 1) {
      this.detach();
      this.connect();
    }
  }
  stop() {
    this.stopped = true;
    this.clearTimer(this.pollTimer);
    this.clearTimer(this.retryTimer);
    this.detach();
  }
}
