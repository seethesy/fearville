import {database} from '@/db';
import {accountAuth} from '@/lib/accounts/service';
import {requirePlayerAccount} from '@/lib/admin/access';
import {json,errorResponse,limited} from '@/lib/game/store';
import {walletHistory} from '@/lib/trust/history';
import {gameTrustEarned} from '@/lib/trust/game-rewards';
export async function GET(r:Request) {
  try {
    const a=await accountAuth(r);
    if(!a) return json({error:'not_signed_in'},401);
    await requirePlayerAccount(a.id);
    await limited(r,'wallet',120);
    const params=new URL(r.url).searchParams;
    const game=params.get('game');
    if(game && game.length>200) return json({error:'invalid_request'},400);
    return json({...await walletHistory(database(),a.id,params),...(game?{gameEarned:await gameTrustEarned(database(),a.id,game)}:{})},200,{'Cache-Control':'no-store'});
  } catch(e) {return errorResponse(e);}
}
