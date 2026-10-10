import { database } from '@/db';
import { accountAuth, attachMember } from '@/lib/accounts/service';
import { profileDefaults } from '@/lib/accounts/profile';
import { newGame, uuid } from '@/lib/game/types';
import { newSandboxGame } from '@/lib/game/sandbox';
import { requireThat } from '@/lib/game/engine';
import { renameMember, removeMember } from '@/lib/game/membership';
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
  read,
} from '@/lib/game/store';
export async function GET(r: Request) {
  try {
    const { actor, code } = await auth(r);
    const { game } = await read(code);
    const player = game.players.find((p) => p.id === actor.id);
    requireThat(actor.host || player, 'This seat is no longer available.');
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
      for (let attempt = 0; attempt < 8; attempt++) {
        const { actor, code } = await auth(r);
        const { game, version } = await read(code);
        if (body.action === 'deleteLobby') {
          requireThat(actor.host, 'Only the Storyteller can delete the lobby.');
          requireThat(game.phase === 'lobby', 'Only a lobby can be deleted.');
          const deleted = await db
            .prepare('DELETE FROM sessions WHERE code = ? AND version = ?')
            .bind(code, version)
            .run();
          if (!deleted.meta.changes) continue;
          return json({ ok: true }, 200, {
            'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
          });
        }
        let removed = '';
        if (body.action === 'rename')
          renameMember(game, actor, body.name, Date.now());
        else {
          requireThat(
            body.action !== 'remove' || actor.host,
            'Only the Storyteller can remove players.',
          );
          if (body.action === 'leaveLobby') {
            requireThat(
              !actor.host,
              'The Storyteller can delete the lobby instead.',
            );
            requireThat(
              game.phase === 'lobby' || game.phase === 'ended',
              'Finish the game or return to the lobby before leaving it.',
            );
          }
          removed = removeMember(
            game,
            actor,
            body.action === 'leaveLobby' ? actor.id : body.player,
            Date.now(),
          );
        }
        // Unique operation marker makes credential revocation conditional on
        // this exact successful update, inside one atomic D1 transaction.
        const state = JSON.stringify({ ...game, membershipRevision: uuid() });
        const statements = [
          db
            .prepare(
              'UPDATE sessions SET state = ?, version = version + 1 WHERE code = ? AND version = ?',
            )
            .bind(state, code, version),
        ];
        if (removed) {
          for (const table of ['members', 'account_seats'])
            statements.push(
              db
                .prepare(
                  `DELETE FROM ${table} WHERE code = ? AND player = ? AND EXISTS (SELECT 1 FROM sessions WHERE code = ? AND state = ?)`,
                )
                .bind(code, removed, code, state),
            );
        }
        const result = await db.batch(statements);
        if (!result[0].meta.changes) continue;
        return json(
          { ok: true },
          200,
          body.action === 'leaveLobby'
            ? {
                'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
              }
            : {},
        );
      }
      return json({ error: 'The table changed. Please try again.' }, 409);
    }
    const account = await accountAuth(r);
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
        return json({ code: current.code, token: tokenOf(r), resumed: true }, 200, {
          'Set-Cookie': cookie(r, tokenOf(r)),
        });
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
