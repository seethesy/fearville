import { database } from '@/db';
import { accountAuth, attachMember } from '@/lib/accounts/service';
import { newGame, uuid } from '@/lib/game/types';
import { requireThat } from '@/lib/game/engine';
import {
  joinSession,
  memberExpiry,
  memberCookie as cookie,
} from '@/lib/game/join';
import {
  auth,
  hash,
  cookieName,
  json,
  errorResponse,
  checkOrigin,
  limited,
  tokenOf,
} from '@/lib/game/store';
export async function GET(r: Request) {
  try {
    const { actor, code } = await auth(r);
    return json({ code, host: actor.host, recoveryKey: tokenOf(r) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    requireThat(
      Number(r.headers.get('content-length') || 0) < 16000,
      'Request is too large.',
    );
    const raw = await r.text();
    requireThat(raw.length < 16000, 'Request is too large.');
    const body = JSON.parse(raw);
    await limited(r, 'entry', 30);
    const token = uuid() + uuid();
    const tokenHash = await hash(token);
    const db = database();
    const account = await accountAuth(r);
    if (body.action === 'restore') {
      requireThat(
        typeof body.recoveryKey === 'string' && body.recoveryKey.length < 200,
        'Enter a recovery key.',
      );
      const restored = await auth(
        new Request(r.url, {
          headers: { authorization: 'Bearer ' + body.recoveryKey },
        }),
      );
      if (account) await attachMember(await hash(body.recoveryKey), account.id);
      return json({ code: restored.code, token: body.recoveryKey }, 200, {
        'Set-Cookie': cookie(r, body.recoveryKey),
      });
    }
    const name = String(body.name || '')
      .trim()
      .slice(0, 32);
    requireThat(name, 'Enter your name.');
    if (body.action === 'create') {
      await limited(r, 'create', 5);
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      for (let attempt = 0; attempt < 5; attempt++) {
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        const code = Array.from(
          bytes,
          (n) => alphabet[n % alphabet.length],
        ).join('');
        const exists = await db
          .prepare('SELECT code FROM sessions WHERE code = ?')
          .bind(code)
          .first();
        if (exists) continue;
        const game = newGame(code, name);
        await db.batch([
          db
            .prepare(
              'INSERT INTO sessions (code,state,version,created) VALUES (?,?,0,?)',
            )
            .bind(code, JSON.stringify(game), Date.now()),
          db
            .prepare(
              'INSERT INTO members (token_hash,code,player,host,expires) VALUES (?,?,?,1,?)',
            )
            .bind(tokenHash, code, 'host', memberExpiry()),
        ]);
        if (account) await attachMember(tokenHash, account.id);
        return json({ code, token }, 200, { 'Set-Cookie': cookie(r, token) });
      }
      throw Error('Unable to create a session. Try again.');
    }
    requireThat(body.action === 'join', 'Unknown session action.');
    const code = String(body.code || '').toUpperCase();
    if (await joinSession(code, name, tokenHash)) {
      if (account) await attachMember(tokenHash, account.id);
      return json({ code, token }, 200, { 'Set-Cookie': cookie(r, token) });
    }
    return json({ error: 'The table changed. Please join again.' }, 409);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(r: Request) {
  try {
    checkOrigin(r);
    return json({ ok: true }, 200, {
      'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
