import { database } from '@/db';
import { accountAuth } from '@/lib/accounts/service';
import { requirePlayerAccount } from '@/lib/admin/access';
import { json, errorResponse, limited, checkOrigin } from '@/lib/game/store';
import { purchase, ShopError } from '@/lib/trust/shop';
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    await limited(r, 'shop-purchase-ip', 30);
    const a = await accountAuth(r);
    if (!a) return json({ error: 'not_signed_in' }, 401);
    await requirePlayerAccount(a.id);
    await limited(
      new Request(r.url, {
        headers: { 'cf-connecting-ip': 'account:' + a.id },
      }),
      'shop-purchase-account',
      30,
    );
    const raw = await r.text();
    if (raw.length > 1000) return json({ error: 'invalid_request' }, 400);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json({ error: 'invalid_request' }, 400);
    return json(
      {
        purchase: await purchase(
          database(),
          a.id,
          body.cosmeticId,
          body.idempotencyKey,
        ),
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (e) {
    if (e instanceof ShopError)
      return json(
        { error: e.code },
        e.code === 'not_signed_in'
          ? 401
          : e.code === 'not_found'
            ? 404
            : e.code === 'invalid_request'
              ? 400
              : 409,
      );
    return errorResponse(e);
  }
}
