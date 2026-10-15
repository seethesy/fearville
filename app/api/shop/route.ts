import {database} from '@/db';
import {accountAuth} from '@/lib/accounts/service';
import {requirePlayerAccount} from '@/lib/admin/access';
import {json,errorResponse,limited} from '@/lib/game/store';
import {listCatalog} from '@/lib/trust/catalog';
export async function GET(r:Request) {
  try {
    await limited(r,'shop-browse',120);
    const a=await accountAuth(r);
    if(a) await requirePlayerAccount(a.id);
    return json({catalog:await listCatalog(database(),a?.id??null)},200,{'Cache-Control':'no-store'});
  } catch(e) {return errorResponse(e);}
}
