import { authMember, checkOrigin, errorResponse, limited } from '@/lib/game/store';
import { table } from '@/lib/game/table-client';
export async function GET(r: Request) {
  try {
    checkOrigin(r);
    const { actor, code } = await authMember(r);
    const params = new URL(r.url).searchParams;
    if (params.get('code') !== code) throw Error('AUTH');
    if (r.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket upgrade required.',{status:426});
    await limited(r,'table-socket',180);
    // Never forward caller-supplied identity headers or put credentials in a URL.
    const headers = new Headers({ Upgrade:'websocket', 'X-Table-Code':code, 'X-Table-Actor':JSON.stringify(actor) });
    return table(code).fetch(new Request('https://table.internal/socket?pov='+encodeURIComponent(params.get('pov') || ''),{headers}));
  } catch(e) { return errorResponse(e); }
}
