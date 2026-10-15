import { read } from '@/lib/game/store';
import { log } from '@/lib/game/engine';
import {
  cancelGame,
  gameStatements,
  removalPlan,
  removeFromGame,
} from '../lobbies';
import { type Args, type Plan, db } from './audit.ts';
import { targetAccount, accountGuard } from './accounts.ts';
export async function lobbyPlan(name: string, args: Args): Promise<Plan> {
  if (name === 'lobbies') {
    const rows = await db()
      .prepare(
        "SELECT code,json_extract(state,'$.phase') AS phase,json_extract(state,'$.hostName') AS storyteller,json_extract(state,'$.script') AS script FROM sessions WHERE json_extract(state,'$.phase')<>'ended' ORDER BY created DESC LIMIT 100",
      )
      .all();
    return { statements: [], output: rows.results };
  }
  const code = String(args.lobby ?? '')
    .trim()
    .toUpperCase();
  if (name === 'kick') {
    const a = await targetAccount(String(args.account));
    const removal = await removalPlan(a.id, code || undefined);
    if (!removal.changed.length)
      throw Error('Account is not a member of that lobby.');
    return {
      statements: [...accountGuard(a), ...removal.statements],
      tables: removal.changed,
      target: a.id,
      before: { lobbies: removal.changed },
      after: { removed: true },
      output: { removedFrom: removal.changed },
    };
  }
  if (!/^[A-Z0-9]{6}$/.test(code))
    throw Error('Enter a valid six-character lobby code.');
  const { game, version } = await read(code);
  const describe = () => ({
    code,
    phase: game.phase,
    script: game.script,
    storyteller: game.hostName,
    players: game.players
      .filter((p) => !p.departed)
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        alive: p.alive,
        seat: p.seat,
      })),
  });
  const before = describe();
  if (name === 'lobby') return { statements: [], target: code, output: before };
  const extra: D1PreparedStatement[] = [];
  if (name === 'endgame') {
    if (game.phase === 'ended') throw Error('This game has already ended.');
    cancelGame(game, Date.now());
  } else if (name === 'storyteller') {
    const a = await targetAccount(String(args.account));
    if (a.banned !== null)
      throw Error('A banned account cannot be Storyteller.');
    const existing = await db()
      .prepare(
        'SELECT player,host FROM account_seats WHERE account=? AND code=?',
      )
      .bind(a.id, code)
      .first<{ player: string; host: number }>();
    if (existing?.host) throw Error('This account is already Storyteller.');
    // Preserve the old host's recorded credit, but rotate all host credentials.
    // The incoming host resumes from Saved lobbies, obtaining a fresh token.
    if (existing) {
      removeFromGame(game, existing.player, Date.now());
      extra.push(
        db()
          .prepare('DELETE FROM members WHERE code=? AND player=?')
          .bind(code, existing.player),
      );
    }
    extra.push(
      ...accountGuard(a),
      db().prepare('DELETE FROM members WHERE code=? AND host=1').bind(code),
      db()
        .prepare(
          'DELETE FROM account_seats WHERE code=? AND (host=1 OR account=?)',
        )
        .bind(code, a.id),
      db()
        .prepare(
          "INSERT INTO account_seats(id,account,code,player,host) VALUES (?,?,?,'host',1)",
        )
        .bind(code + ':host', a.id, code),
    );
    game.hostName = a.name;
    game.history = [];
    log(
      game,
      'Administration assigned a new Storyteller: ' + a.name + '.',
      Date.now(),
      true,
    );
  }
  return {
    statements: [...gameStatements(game, version), ...extra],
    tables: [code],
    target: code,
    before,
    after: describe(),
    output: describe(),
  };
}
