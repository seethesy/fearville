import { env } from 'cloudflare:workers';
import { database } from '@/db';
import { currentEnvironment } from '@/lib/runtime/environment';
export async function GET() {
  let d1 = false;
  let durableObject: 'ok' | 'unavailable' | 'not_configured' = 'not_configured';
  try {
    await database().prepare('SELECT 1 AS ok').first();
    d1 = true;
  } catch {
    /* No private database errors in health responses. */
  }
  if (env.ENVIRONMENT_PROBE) {
    try {
      const response = await env.ENVIRONMENT_PROBE.get(
        env.ENVIRONMENT_PROBE.idFromName('health'),
      ).fetch('https://probe/health');
      durableObject = response.ok ? 'ok' : 'unavailable';
    } catch {
      durableObject = 'unavailable';
    }
  }
  const values = env as unknown as Record<string, unknown>;
  const environment = currentEnvironment();
  const ok = d1 && (durableObject === 'ok' || environment === 'local');
  return Response.json(
    {
      ok,
      build: typeof values.BUILD_ID === 'string' ? values.BUILD_ID : 'local',
      environment,
      d1: d1 ? 'ok' : 'unavailable',
      durableObject,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
