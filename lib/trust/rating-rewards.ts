import {ECONOMY} from './config.ts';
import {createWalletStatement} from './wallet.ts';
// Append these statements to the SAME batch as the rating upsert. All raters
// contribute to one capped game entitlement; revisions apply only its delta.
// Rater identifiers remain in the existing private ratings table, never in
// financial history, idempotency keys, notifications or wallet responses.
export function ratingRewardStatements(db:D1Database,game:string,host:string,now:number) {
  const day=Math.floor(now/86400000)*86400000;
  return [
    createWalletStatement(db,host),
    db.prepare(`INSERT INTO trust_rating_states(game) SELECT g.id FROM games g JOIN trust_game_rewards r ON r.game=g.id WHERE g.id=? AND r.active=1
      ON CONFLICT(game) DO UPDATE SET revision=trust_rating_states.revision+1`).bind(game),
    db.prepare(`INSERT INTO trust_ledger(wallet,amount,balance_after,kind,origin,source,reason,idempotency_key,created)
      SELECT wallet,delta,balance+delta,CASE WHEN delta<0 THEN 'reversal' ELSE 'earn' END,'earned',?,'rating',entry_key,? FROM (
        SELECT wallet,balance,entry_key,CASE WHEN target>paid THEN MIN(target-paid,daily_room,game_room) ELSE target-paid END AS delta FROM (
          SELECT w.id AS wallet,w.balance,'rating:' || g.id || ':' || s.revision AS entry_key,
            COALESCE((SELECT SUM(amount) FROM trust_ledger WHERE wallet=w.id AND source=g.id AND reason='rating'),0) AS paid,
            MAX(0,?-COALESCE((SELECT SUM(amount) FROM trust_ledger WHERE wallet=w.id AND origin='earned' AND kind IN ('earn','reversal') AND created>=? AND created<?),0)) AS daily_room,
            MAX(0,?-COALESCE((SELECT SUM(amount) FROM trust_ledger WHERE wallet=w.id AND origin='earned' AND source=g.id AND kind IN ('earn','reversal')),0)) AS game_room,
            (SELECT CASE WHEN COUNT(*)>=? THEN MIN(?,COALESCE(SUM(CASE stars WHEN 4 THEN ? WHEN 5 THEN ? ELSE 0 END),0)) ELSE 0 END FROM (
              SELECT DISTINCT rating.rater,rating.stars FROM storyteller_ratings rating
              WHERE rating.game=g.id AND rating.storyteller=g.host_account AND rating.rater<>g.host_account
              AND rating.rater IN (SELECT value FROM json_each(r.eligible))
              AND EXISTS(SELECT 1 FROM accounts WHERE id=rating.rater AND role='player')
              AND NOT EXISTS(SELECT 1 FROM trust_account_links WHERE (account_low=rating.rater AND account_high=g.host_account) OR (account_high=rating.rater AND account_low=g.host_account))
            )) AS target
          FROM games g JOIN trust_game_rewards r ON r.game=g.id AND r.active=1
          JOIN trust_rating_states s ON s.game=g.id JOIN wallets w ON w.account=g.host_account
          WHERE g.id=? AND g.host_account=? AND r.player_count>=? AND g.nights>=?
        )
      ) WHERE delta<>0`)
      .bind(game,now,ECONOMY.dailyCap,day,day+86400000,ECONOMY.gameCap,ECONOMY.minRaters,ECONOMY.ratingGameCap,ECONOMY.ratingFour,ECONOMY.ratingFive,game,host,ECONOMY.minPlayers,ECONOMY.minNight),
  ];
}
