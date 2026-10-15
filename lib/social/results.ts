import { database } from '@/db';
import type { Game } from '@/lib/game/types';
import { recapOf } from '@/lib/game/lobby';
import { deriveResult, gameID } from './derive';
import { BASE_XP, mvpShares } from './progression';
import {beginGameRewardsStatement,syncGameRewards,withdrawGameRewardsStatements} from '../trust/game-rewards';

// Version guards prevent a delayed poll from restoring a withdrawn result or
// overwriting newer MVP rewards. D1 batches commit the whole result atomically.
export async function recordResult(
  g: Game,
  started: number,
  ended: number,
  version?: number,
) {
  const record = deriveResult(g, started, ended);
  if (!record || g.sandbox) return false;
  const db = database();
  const guard =
    'EXISTS (SELECT 1 FROM sessions WHERE code=? AND (? IS NULL OR version=?))';
  const guarded = [g.code, version ?? null, version ?? null];
  const rewards = mvpShares(
    record.seats.map((s) => s.player),
    g.mvpVotes,
  );
  const snapshot = g.progression;
  const hostAccount = snapshot?.hostAccount ?? null;
  const statements = [
    db
      .prepare(`INSERT INTO games (id,code,host_account,host_name,winner,reason,players,days,nights,started,ended,script,ranked,host_xp)
    SELECT ?,?,(SELECT id FROM accounts WHERE role='player' AND id=COALESCE(?,(SELECT account FROM account_seats WHERE code=? AND host=1 LIMIT 1))),?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
    ON CONFLICT(id) DO UPDATE SET host_account=COALESCE(excluded.host_account,games.host_account),host_name=excluded.host_name,winner=excluded.winner,reason=excluded.reason,players=excluded.players,days=excluded.days,nights=excluded.nights,ended=excluded.ended,script=excluded.script,ranked=excluded.ranked,host_xp=excluded.host_xp`)
      .bind(
        record.id,
        record.code,
        hostAccount,
        record.code,
        record.hostName,
        record.winner,
        record.reason,
        record.players,
        record.days,
        record.nights,
        record.started,
        record.ended,
        record.script,
        Number(record.ranked),
        BASE_XP * 3,
        ...guarded,
      ),
  ];
  for (const s of record.seats) {
    const rating = snapshot?.seats.find((p) => p.player === s.player);
    statements.push(
      db
        .prepare(`INSERT INTO game_players (game,player,account,name,role,team,won,alive,role_type,base_xp,mvp_xp,mvp_votes,rating_before,opponent_rating,team_rating,elo_delta)
      SELECT ?,?,(SELECT id FROM accounts WHERE role='player' AND id=COALESCE(?,(SELECT account FROM account_seats WHERE code=? AND player=? AND host=0 LIMIT 1))),?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
      ON CONFLICT(game,player) DO UPDATE SET account=COALESCE(excluded.account,game_players.account),name=excluded.name,role=excluded.role,team=excluded.team,won=excluded.won,alive=excluded.alive,role_type=excluded.role_type,base_xp=excluded.base_xp,mvp_xp=excluded.mvp_xp,mvp_votes=excluded.mvp_votes,rating_before=excluded.rating_before,opponent_rating=excluded.opponent_rating,team_rating=excluded.team_rating,elo_delta=excluded.elo_delta`)
        .bind(
          record.id,
          s.player,
          rating?.account ?? null,
          record.code,
          s.player,
          s.name,
          s.role,
          s.team,
          Number(s.won),
          Number(s.alive),
          s.roleType,
          BASE_XP * (s.won ? 1.5 : 1),
          rewards[s.player].xp,
          rewards[s.player].votes,
          rating?.rating ?? null,
          rating?.opponentRating ?? null,
          rating?.teamRating ?? null,
          record.ranked && rating ? (s.won ? rating.win : rating.loss) : 0,
          ...guarded,
        ),
    );
  }
  statements.push(
    db.prepare(`UPDATE games SET recap=? WHERE id=? AND ${guard}`).bind(
      JSON.stringify({
        ...recapOf(g, ended),
        id: record.id,
        started: record.started,
      }),
      record.id,
      ...guarded,
    ),
    db
      .prepare(`DELETE FROM ranked_seats WHERE game=? AND ${guard}`)
      .bind(record.id, ...guarded),
  );
  statements.push(beginGameRewardsStatement(db,record.id,ended,guard,guarded));
  const result = await db.batch(statements);
  await syncGameRewards(db,record.id,ended,guard,guarded);
  return result[0].meta.changes > 0;
}

export async function voidResult(
  code: string,
  started: number,
  version?: number,
) {
  const db=database();
  const guard='EXISTS (SELECT 1 FROM sessions WHERE code=? AND (? IS NULL OR version=?))';
  const values=[code,version??null,version??null];
  await db.batch([
    ...withdrawGameRewardsStatements(db,gameID(code,started),Date.now(),guard,values),
    db.prepare(`DELETE FROM games WHERE id=? AND ${guard}`).bind(gameID(code,started),...values),
  ]);
}
export async function isRecorded(code: string, started: number) {
  return !!(await database()
    .prepare('SELECT 1 AS present FROM games WHERE id=?')
    .bind(gameID(code, started))
    .first());
}

export async function syncMvp(g: Game, version?: number) {
  if (g.sandbox) return;
  const recaps: {
    id: string;
    players: { id: string }[];
    votes?: Record<string, string[]>;
  }[] = [...(g.recaps ?? [])];
  if (g.phase === 'ended')
    recaps.push({
      id: gameID(g.code, g.gameStartedAt ?? 0),
      players: g.players,
      votes: g.mvpVotes,
    });
  const db = database();
  const recorded = await db
    .prepare(
      'SELECT p.game,p.player,p.mvp_votes,p.mvp_xp FROM game_players p JOIN games games ON games.id=p.game WHERE games.code=?',
    )
    .bind(g.code)
    .all<{ game: string; player: string; mvp_votes: number; mvp_xp: number }>();
  const existing = new Map(
    recorded.results.map((r) => [`${r.game}:${r.player}`, r]),
  );
  const statements = recaps.flatMap((r) => {
    const rewards = mvpShares(
      r.players.map((p) => p.id),
      r.votes,
    );
    return r.players
      .filter((p) => {
        const row = existing.get(`${r.id}:${p.id}`);
        return (
          row &&
          (row.mvp_votes !== rewards[p.id].votes ||
            row.mvp_xp !== rewards[p.id].xp)
        );
      })
      .map((p) =>
        db
          .prepare(
            'UPDATE game_players SET mvp_xp=?,mvp_votes=? WHERE game=? AND player=? AND (mvp_xp<>? OR mvp_votes<>?) AND EXISTS (SELECT 1 FROM sessions WHERE code=? AND (? IS NULL OR version=?))',
          )
          .bind(
            rewards[p.id].xp,
            rewards[p.id].votes,
            r.id,
            p.id,
            rewards[p.id].xp,
            rewards[p.id].votes,
            g.code,
            version ?? null,
            version ?? null,
          ),
      );
  });
  for (let offset = 0; offset < statements.length; offset += 50)
    await db.batch(statements.slice(offset, offset + 50));
  for (const recap of [
    ...(g.recaps ?? []),
    ...(g.phase === 'ended' ? [recapOf(g, g.gameEndedAt ?? Date.now())] : []),
  ]) {
    await db
      .prepare(
        'UPDATE games SET recap=? WHERE id=? AND recap IS NOT ? AND EXISTS (SELECT 1 FROM sessions WHERE code=? AND (? IS NULL OR version=?))',
      )
      .bind(
        JSON.stringify(recap),
        recap.id,
        JSON.stringify(recap),
        g.code,
        version ?? null,
        version ?? null,
      )
      .run();
  }
}
export async function syncResult(
  g: Game,
  started: number,
  now: number,
  version?: number,
  update = false,
) {
  if (g.sandbox) return;
  if (g.phase === 'ended') {
    if (update || !(await isRecorded(g.code, started)))
      await recordResult(g, started, g.gameEndedAt ?? now, version);
    else {
      await syncMvp(g, version);
      await syncGameRewards(database(),gameID(g.code,started),g.gameEndedAt??now,
        'EXISTS (SELECT 1 FROM sessions WHERE code=? AND (? IS NULL OR version=?))',[g.code,version??null,version??null]);
    }
  } else if (g.night > 0 && (await isRecorded(g.code, started)))
    await voidResult(g.code, started, version);
}

// Guest seats acquire their existing XP/history when attached, once only.
export async function linkSeatRecords(account: string) {
  const db = database();
  await db.batch([
    db
      .prepare(
        "UPDATE game_players SET account=? WHERE account IS NULL AND EXISTS (SELECT 1 FROM account_seats s JOIN sessions se ON se.code=s.code WHERE s.account=? AND s.host=0 AND s.player=game_players.player AND (game_players.game=s.code || ':' || se.created OR game_players.game=s.code || ':' || json_extract(se.state,'$.gameStartedAt') OR EXISTS (SELECT 1 FROM json_each(se.state,'$.recaps') r WHERE json_extract(r.value,'$.id')=game_players.game AND EXISTS (SELECT 1 FROM json_each(r.value,'$.players') p WHERE json_extract(p.value,'$.id')=s.player)) OR EXISTS (SELECT 1 FROM session_parts sp,json_each(sp.state) r WHERE sp.code=se.code AND sp.part LIKE 'recaps:%' AND json_extract(r.value,'$.id')=game_players.game AND EXISTS (SELECT 1 FROM json_each(r.value,'$.players') p WHERE json_extract(p.value,'$.id')=s.player))))",
      )
      .bind(account, account),
    db
      .prepare(
        "UPDATE games SET host_account=? WHERE host_account IS NULL AND EXISTS (SELECT 1 FROM account_seats s JOIN sessions se ON se.code=s.code WHERE s.account=? AND s.host=1 AND (games.id=s.code || ':' || se.created OR games.id=s.code || ':' || json_extract(se.state,'$.gameStartedAt') OR EXISTS (SELECT 1 FROM json_each(se.state,'$.recaps') r WHERE json_extract(r.value,'$.id')=games.id) OR EXISTS (SELECT 1 FROM session_parts sp,json_each(sp.state) r WHERE sp.code=se.code AND sp.part LIKE 'recaps:%' AND json_extract(r.value,'$.id')=games.id)))",
      )
      .bind(account, account),
  ]);
}
