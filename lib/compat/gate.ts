// FEAR-120, Worker side: refuse API calls from shells below the minimum
// build (426 + update link), flag ones below the recommended build, and
// count client versions per day (on account loads, about once per app open).
import { database } from '@/db';
import { readFlags } from '../flags/flags';
import {
  CLIENT_HEADER,
  UPDATE_HEADER,
  clientLabel,
  compatibility,
  gateExempt,
  parseClient,
  type Compatibility,
} from './versions.ts';

export async function versionGate(
  request: Request,
): Promise<{ blocked?: Response; verdict: Compatibility }> {
  const url = new URL(request.url);
  const client = parseClient(
    request.headers.get(CLIENT_HEADER) ?? url.searchParams.get('client'),
  );
  if (
    gateExempt(url.pathname) ||
    (client.platform !== 'ios' && client.platform !== 'android')
  )
    return { verdict: { status: 'ok' } };
  const verdict = compatibility(client, (await readFlags()).builds);
  if (verdict.status === 'required')
    return {
      verdict,
      blocked: Response.json(
        {
          error: 'Update Fearville to keep playing.',
          updateRequired: true,
          updateUrl: verdict.updateUrl,
        },
        { status: 426, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  return { verdict };
}

/** Add the "update available" hint to an API response. */
export function withVerdict(response: Response, verdict: Compatibility) {
  if (verdict.status !== 'recommended' || response.status === 101)
    return response;
  const headers = new Headers(response.headers);
  headers.set(UPDATE_HEADER, 'recommended');
  if (verdict.updateUrl) headers.set(UPDATE_HEADER + '-Url', verdict.updateUrl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function countClient(request: Request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/accounts') return;
  const label = clientLabel(parseClient(request.headers.get(CLIENT_HEADER)));
  const day = new Date().toISOString().slice(0, 10);
  return database()
    .prepare(
      'INSERT INTO client_versions(day,client,count) VALUES (?,?,1) ON CONFLICT(day,client) DO UPDATE SET count=count+1',
    )
    .bind(day, label)
    .run()
    .catch(() => {
      /* Counting never affects the request. */
    });
}
