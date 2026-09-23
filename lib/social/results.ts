import { database } from '@/db';
import type { Game } from '@/lib/game/types';
import { deriveResult, gameID } from './derive';

// Records a finished game. Safe to call repeatedly: an existing record is
// updated in place (so a game that ended, was rewound, and ended again with a
// different outcome is corrected), and ratings attached to it are kept. Seats are linked to accounts through
// account_seats at recording time; seats attached later are linked by
// linkSeatRecords(). Returns true when a record exists after the call.
export async function recordResult(g: Game, started: number, ended: number) {
  const record = deriveResult(g, started, ended);
  if (!record) return false;
  const db = database();
  await db.batch([
    db
      .prepare(
        'INSERT INTO games (id,code,host_account,host_name,winner,reason,players,days,nights,started,ended) VALUES (?,?,(SELECT account FROM account_seats WHERE code=? AND host=1 LIMIT 1),?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET host_account=COALESCE(excluded.host_account,games.host_account),host_name=excluded.host_name,winner=excluded.winner,reason=excluded.reason,players=excluded.players,days=excluded.days,nights=excluded.nights,ended=excluded.ended',
      )
      .bind(
        record.id,
        record.code,
        record.code,
        record.hostName,
        record.winner,
        record.reason,
        record.players,
        record.days,
        record.nights,
        record.started,
        record.ended,
      ),
    ...record.seats.map((s) =>
      db
        .prepare(
          'INSERT INTO game_players (game,player,account,name,role,team,won,alive) VALUES (?,?,(SELECT account FROM account_seats WHERE code=? AND player=? AND host=0 LIMIT 1),?,?,?,?,?) ON CONFLICT(game,player) DO UPDATE SET account=COALESCE(excluded.account,game_players.account),name=excluded.name,role=excluded.role,team=excluded.team,won=excluded.won,alive=excluded.alive',
        )
        .bind(
          record.id,
          s.player,
          record.code,
          s.player,
          s.name,
          s.role,
          s.team,
          s.won ? 1 : 0,
          s.alive ? 1 : 0,
        ),
    ),
  ]);
  return true;
}

// Called when the Storyteller rewinds out of the ended phase: the result was
// provisional, so the record and any ratings attached to it are withdrawn.
// The game is recorded again if it ends again.
export async function voidResult(code: string, started: number) {
  await database()
    .prepare('DELETE FROM games WHERE id=?')
    .bind(gameID(code, started))
    .run();
}

export async function isRecorded(code: string, started: number) {
  return !!(await database()
    .prepare('SELECT 1 AS present FROM games WHERE id=?')
    .bind(gameID(code, started))
    .first());
}

// Keeps ended games in sync with the state: records a game whose result is
// missing (for example after a transient database failure at the moment the
// game ended) and withdraws a record for a game that was rewound.
export async function syncResult(g: Game, started: number, now: number) {
  if (g.phase === 'ended') {
    if (!(await isRecorded(g.code, started)))
      await recordResult(g, started, now);
  } else if (g.night > 0 && (await isRecorded(g.code, started)))
    await voidResult(g.code, started);
}

// When a seat is attached to an account after the game was recorded, the
// existing record picks up the account so the player's stats include it.
export async function linkSeatRecords(account: string) {
  const db = database();
  await db.batch([
    db
      .prepare(
        "UPDATE game_players SET account=? WHERE account IS NULL AND EXISTS (SELECT 1 FROM account_seats s JOIN sessions se ON se.code=s.code WHERE s.account=? AND s.host=0 AND s.player=game_players.player AND game_players.game=s.code || ':' || se.created)",
      )
      .bind(account, account),
    db
      .prepare(
        "UPDATE games SET host_account=? WHERE host_account IS NULL AND EXISTS (SELECT 1 FROM account_seats s JOIN sessions se ON se.code=s.code WHERE s.account=? AND s.host=1 AND games.id=s.code || ':' || se.created)",
      )
      .bind(account, account),
  ]);
}
