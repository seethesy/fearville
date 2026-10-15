import handler from 'vinext/server/fetch-handler';
import { appleAppSiteAssociation } from './lib/mobile/apple-association';
import { runtimeEnvironment, environmentHeaders } from './lib/runtime/config';
import { GET as tableSocket } from './app/api/table/socket/route';
import { countClient, versionGate, withVerdict } from './lib/compat/gate';
export { EnvironmentProbe } from './lib/runtime/probe';
export { GameTable } from './lib/game/table-object';
export default {
  async fetch(
    request: Request,
    bindings: Cloudflare.Env,
    context: ExecutionContext,
  ) {
    if (
      new URL(request.url).pathname ===
      '/.well-known/apple-app-site-association'
    )
      return appleAppSiteAssociation(request);
    // FEAR-120: shells below the minimum build get 426 (update required).
    const { blocked, verdict } = await versionGate(request);
    if (blocked) return blocked;
    const counted = countClient(request);
    if (counted) context.waitUntil(counted);
    if (new URL(request.url).pathname === '/api/table/socket')
      return tableSocket(request);
    const response = withVerdict(
      await handler.fetch(request, bindings, context),
      verdict,
    );
    if (
      response.status === 101 ||
      runtimeEnvironment(bindings as unknown as Record<string, unknown>) !==
        'staging'
    )
      return response;
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(
      environmentHeaders(
        runtimeEnvironment(bindings as unknown as Record<string, unknown>),
      ),
    ))
      headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
