import {computeAwards,awardStatement} from './awards.ts';
import {createWalletStatement} from './wallet.ts';
import {ECONOMY} from './config.ts';
// Capture signed-in participants in the result transaction, before any late
// seat linking. Keep that entitlement snapshot through every rewind cycle.
export function beginGameRewardsStatement(db:D1Database,game:string,now:number,guard='1',values:(string|number|null)[]=[]) {
  return db.prepare(`INSERT INTO trust_game_rewards(game,eligible,player_count,created)
    SELECT g.id,(SELECT json_group_array(account) FROM (
      SELECT account FROM game_players WHERE game=g.id AND account IS NOT NULL
      UNION SELECT host_account FROM games WHERE id=g.id AND host_account IS NOT NULL)),
      (SELECT COUNT(DISTINCT account) FROM game_players WHERE game=g.id AND account IS NOT NULL),?
    FROM games g WHERE g.id=? AND ${guard}
    ON CONFLICT(game) DO UPDATE SET cycle=trust_game_rewards.cycle+CASE WHEN trust_game_rewards.active=0 THEN 1 ELSE 0 END,active=1`)
    .bind(now,game,...values);
}
export async function syncGameRewards(db:D1Database,game:string,now:number,guard='1',values:(string|number|null)[]=[]) {
  const cycle=await db.prepare('SELECT r.*,g.host_account,g.winner,g.nights FROM trust_game_rewards r JOIN games g ON g.id=r.game WHERE r.game=? AND r.active=1').bind(game).first<{cycle:number;eligible:string;player_count:number;host_account:string|null;winner:string;nights:number}>();
  if(!cycle || cycle.player_count<ECONOMY.minPlayers) return;
  const eligible=new Set<string>(JSON.parse(cycle.eligible));
  const players=(await db.prepare('SELECT account,MAX(won) won FROM game_players WHERE game=? GROUP BY account').bind(game).all<{account:string|null;won:number}>()).results.map(p=>({account:p.account && eligible.has(p.account)?p.account:null,won:!!p.won}));
  const awards=computeAwards({id:game,cycle:cycle.cycle,ended:true,winner:cycle.winner,nights:cycle.nights,players,host:cycle.host_account && eligible.has(cycle.host_account)?cycle.host_account:null});
  if(!awards.length) return;
  const protectedGuard=`EXISTS(SELECT 1 FROM trust_game_rewards r JOIN games g ON g.id=r.game WHERE r.game=? AND r.cycle=? AND r.active=1) AND (${guard})`;
  await db.batch(awards.flatMap(a=>[createWalletStatement(db,a.account),awardStatement(db,a,game,now,protectedGuard,[game,cycle.cycle,...values])]));
}
export function withdrawGameRewardsStatements(db:D1Database,game:string,now:number,guard='1',values:(string|number|null)[]=[]) {
  const statements:D1PreparedStatement[]=[];
  // Rating corrections use the same opaque game source. Never put raters in
  // financial history, even in private keys returned by internal helpers.
  for(const reason of ['finish','win','rating']) statements.push(db.prepare(`INSERT INTO trust_ledger(wallet,amount,balance_after,kind,origin,source,reason,idempotency_key,created)
    SELECT w.id,-s.total,w.balance-s.total,'reversal','earned',?,?,'rewind:' || ? || ':' || r.cycle || ':' || ?,?
    FROM wallets w JOIN (SELECT wallet,SUM(amount) total FROM trust_ledger WHERE source=? AND reason=? AND origin='earned' GROUP BY wallet HAVING SUM(amount)>0) s ON s.wallet=w.id
    JOIN trust_game_rewards r ON r.game=? AND r.active=1 WHERE ${guard}`).bind(game,reason,game,reason,now,game,reason,game,...values));
  statements.push(db.prepare(`UPDATE trust_game_rewards SET active=0 WHERE game=? AND ${guard}`).bind(game,...values));
  return statements;
}
export async function gameTrustEarned(db:D1Database,account:string,game:string) {
  return (await db.prepare("SELECT COALESCE(SUM(l.amount),0) amount FROM trust_ledger l JOIN wallets w ON w.id=l.wallet WHERE w.account=? AND l.source=? AND l.reason IN ('finish','win') AND l.origin='earned'").bind(account,game).first<{amount:number}>())?.amount??0;
}
