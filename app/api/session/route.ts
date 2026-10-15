import { requirePlayerAccount } from '@/lib/admin/access';
import { database } from '@/db';
import {
  accountAuth,
  attachMember,
  requirePlayerRequest,
} from '@/lib/accounts/service';
import { profileDefaults } from '@/lib/accounts/profile';
import { newGame, uuid } from '@/lib/game/types';
import { newSandboxGame } from '@/lib/game/sandbox';
import { requireThat } from '@/lib/game/engine';
import { table } from '@/lib/game/table-client';
import {
  joinSession,
  memberExpiry,
  memberCookie as cookie,
} from '@/lib/game/join';
import { createStatements } from '@/lib/game/part-store';
import {
  auth,
  hash,
  cookieName,
  json,
  errorResponse,
  checkOrigin,
  limited,
  tokenOf,
  read,
  authenticatedRead,
} from '@/lib/game/store';
export async function GET(r: Request) {
  try {
    const { actor, code, game } = await authenticatedRead(r);
    if (actor.observer)
      return json({
        code,
        host: false,
        observer: true,
        name: 'Admin observer',
        phase: game.phase,
      });
    const player = game.players.find((p) => p.id === actor.id);
    requireThat(
      actor.host || (player && !player.departed),
      'This seat is no longer available.',
    );
    return json({
      code,
      host: actor.host,
      name: actor.host ? game.hostName : player!.name,
      phase: game.phase,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    await requirePlayerRequest(r);
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
    if (body.action === 'leave') {
      // Leaving the screen keeps the seat and account association.
      await auth(r);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(r, tokenOf(r)) });
    }
    if (
      ['rename', 'remove', 'leaveLobby', 'deleteLobby'].includes(body.action)
    ) {
      const { actor, code } = await auth(r);
      await table(code).session(code, actor, body);
      return json(
        { ok: true },
        200,
        ['leaveLobby', 'deleteLobby'].includes(body.action)
          ? {
              'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
            }
          : {},
      );
    }
    const account = await accountAuth(r);
    if (account) await requirePlayerAccount(account.id);
    if (
      (body.action === 'create' || body.action === 'createSandbox') &&
      !account
    )
      return json(
        { error: 'Sign in to create a lobby or open the sandbox.' },
        401,
      );
    // A returning device keeps its existing identity, including Storyteller
    // permissions, instead of creating another seat or failing after start.
    if (body.action === 'join' && tokenOf(r)) {
      let current: Awaited<ReturnType<typeof auth>> | null = null;
      try {
        current = await auth(r);
      } catch (e) {
        if (!(e instanceof Error) || e.message !== 'AUTH') throw e;
      }
      if (
        current?.code ===
        String(body.code || '')
          .trim()
          .toUpperCase()
      ) {
        const { game } = await read(current.code);
        requireThat(
          current.actor.host ||
            game.players.some((p) => p.id === current.actor.id),
          'This seat is no longer available.',
        );
        if (account) await attachMember(await hash(tokenOf(r)), account.id);
        return json(
          { code: current.code, token: tokenOf(r), resumed: true },
          200,
          {
            'Set-Cookie': cookie(r, tokenOf(r)),
          },
        );
      }
    }
    const defaults = account
      ? await profileDefaults(account.id, account.name)
      : undefined;
    const name = String(body.name || defaults?.lobbyName || '')
      .trim()
      .slice(0, 32);
    requireThat(name, 'Enter your name.');
    if (body.action === 'create' || body.action === 'createSandbox') {
      await limited(r, 'create', 5);
      const alphabet = '0123456789';
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
        const game =
          body.action === 'createSandbox'
            ? newSandboxGame(code, name)
            : newGame(code, name);
        await db.batch([
          ...createStatements(db, game, Date.now()),
          db
            .prepare(
              'INSERT INTO members (token_hash,code,player,host,expires) VALUES (?,?,?,1,?)',
            )
            .bind(tokenHash, code, 'host', memberExpiry()),
        ]);
        if (account) await attachMember(tokenHash, account.id);
        await table(code).read(code);
        return json({ code, token }, 200, { 'Set-Cookie': cookie(r, token) });
      }
      throw Error('Unable to create a session. Try again.');
    }
    requireThat(body.action === 'join', 'Unknown session action.');
    const code = String(body.code || '')
      .trim()
      .toUpperCase();
    if (account) {
      const saved = await db
        .prepare(
          'SELECT player,host FROM account_seats WHERE account=? AND code=?',
        )
        .bind(account.id, code)
        .first<{ player: string; host: number }>();
      if (saved) {
        const { game } = await read(code);
        if (
          saved.host ||
          game.players.some((p) => p.id === saved.player && !p.departed)
        ) {
          await db
            .prepare(
              'INSERT INTO members(token_hash,code,player,host,expires) VALUES (?,?,?,?,?)',
            )
            .bind(tokenHash, code, saved.player, saved.host, memberExpiry())
            .run();
          return json({ code, token, resumed: true }, 200, {
            'Set-Cookie': cookie(r, token),
          });
        }
      }
    }
    if (await joinSession(code, name, tokenHash, undefined, defaults)) {
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
