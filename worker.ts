import handler from 'vinext/server/fetch-handler';
import { runtimeEnvironment, environmentHeaders } from './lib/runtime/config';
import { GET as tableSocket } from './app/api/table/socket/route';
export { EnvironmentProbe } from './lib/runtime/probe';
export { GameTable } from './lib/game/table-object';
export default {
  async fetch(
    request: Request,
    bindings: Cloudflare.Env,
    context: ExecutionContext,
  ) {
    if (new URL(request.url).pathname === '/api/table/socket') return tableSocket(request);
    const response = await handler.fetch(request, bindings, context);
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
