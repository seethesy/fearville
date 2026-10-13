import { DurableObject } from 'cloudflare:workers';
// Infrastructure reachability only. Live games remain in D1 until FEAR-85.
export class EnvironmentProbe extends DurableObject {
  async fetch() {
    await this.ctx.storage.get('health');
    return Response.json({ ok: true });
  }
}
