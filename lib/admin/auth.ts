import { accountAuth, accountToken } from '@/lib/accounts/service';
import { hash, limited } from '@/lib/game/store';
export async function requireAdmin(r: Request) {
  const account = await accountAuth(r, true);
  if (!account || account.role !== 'admin') throw Error('FORBIDDEN');
  await limited(r, 'admin:' + account.id, 120);
  return { ...account, sessionHash: await hash(accountToken(r)) };
}
