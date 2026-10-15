import {ECONOMY} from './config.ts';
export type Award = {account:string;amount:number;reason:'finish'|'win';key:string};
export type AwardResult = {
  id:string; cycle:number; ended:boolean; sandbox?:boolean; winner:string|null; nights:number;
  players:{account:string|null;won:boolean}[]; host:string|null;
  // Net earned so far, supplied by the caller. SQL rechecks caps atomically.
  daily?:Record<string,number>; game?:Record<string,number>;
};
export function computeAwards(result: AwardResult): Award[] {
  const players=new Set(result.players.flatMap(p=>p.account?[p.account]:[]));
  if(!result.ended || result.sandbox || !['good','evil','neutral'].includes(result.winner??'') || result.nights<ECONOMY.minNight || players.size<ECONOMY.minPlayers) return [];
  const participants=new Map<string,boolean>();
  for(const p of result.players) if(p.account) participants.set(p.account,(participants.get(p.account)??false)||p.won);
  if(result.host && !participants.has(result.host)) participants.set(result.host,false);
  const awards:Award[]=[];
  for(const [account,won] of participants) {
    let remaining=Math.max(0,Math.min(ECONOMY.dailyCap-(result.daily?.[account]??0),ECONOMY.gameCap-(result.game?.[account]??0)));
    for(const [reason,value] of [['finish',ECONOMY.finish],['win',won?ECONOMY.win:0]] as const) {
      const amount=Math.min(remaining,value);
      if(amount>0) awards.push({account,amount,reason,key:`game:${result.id}:${result.cycle}:${reason}`});
      remaining-=amount;
    }
  }
  return awards;
}
// Each INSERT computes the remaining budget inside SQLite, so racing games and
// rating submissions share the same cap. The ledger itself is the audit record.
export function awardStatement(db:D1Database, award:{account:string;amount:number;reason:string;key:string}, source:string, now:number, guard='1', guardValues:(string|number|null)[]=[]) {
  const day=Math.floor(now/86400000)*86400000;
  return db.prepare(`INSERT INTO trust_ledger(wallet,amount,balance_after,kind,origin,source,reason,idempotency_key,created)
    SELECT id,pay,balance+pay,'earn','earned',?,?,?,? FROM (
      SELECT w.id,w.balance,MIN(?,MAX(0,?-COALESCE((SELECT SUM(amount) FROM trust_ledger WHERE wallet=w.id AND origin='earned' AND created>=? AND created<?),0)),MAX(0,?-COALESCE((SELECT SUM(amount) FROM trust_ledger WHERE wallet=w.id AND origin='earned' AND source=?),0))) AS pay
      FROM wallets w WHERE account=? AND ${guard}
      AND NOT EXISTS(SELECT 1 FROM trust_ledger WHERE wallet=w.id AND idempotency_key=?)
    ) WHERE pay>0`)
    .bind(source,award.reason,award.key,now,award.amount,ECONOMY.dailyCap,day,day+86400000,ECONOMY.gameCap,source,award.account,...guardValues,award.key);
}
