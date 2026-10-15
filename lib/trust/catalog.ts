import { requireAccount } from './wallet.ts';
export const CATEGORIES = ['avatar_icon','death_animation','table_theme','profile_flair'] as const;
export type CosmeticCategory = typeof CATEGORIES[number];
export type Cosmetic = {
  id: string; category: CosmeticCategory; name: string; description: string;
  price: number; tier: string; preview: string; available: number;
  starts: number|null; ends: number|null; sort_order: number; is_default: number;
  created: number; updated: number;
};
export function available(item: Pick<Cosmetic,'available'|'starts'|'ends'>, now: number) {
  return !!item.available && (item.starts===null || now>=item.starts) && (item.ends===null || now<item.ends);
}
export function validateCosmetic(value: Record<string,unknown>) {
  const fields=['id','category','name','description','price','tier','preview','available','starts','ends','sort_order','is_default','created','updated'];
  if (Object.keys(value).some(k=>!fields.includes(k))) throw Error('Presentation fields only.');
  if (typeof value.id!=='string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(value.id) || !CATEGORIES.includes(value.category as CosmeticCategory)) throw Error('Invalid cosmetic.');
  if (!Number.isSafeInteger(value.price) || Number(value.price)<0 || (value.is_default && value.price!==0)) throw Error('Invalid price.');
  for(const field of ['name','description','tier','preview']) if(typeof value[field]!=='string' || (value[field] as string).length>1000) throw Error('Invalid presentation.');
  if (!(value.name as string).length || !(value.preview as string).length) throw Error('Missing presentation.');
  if (!/^[a-zA-Z0-9/_#.-]+$/.test(value.preview as string) || (value.preview as string).includes('..')) throw Error('Invalid preview.');
  for(const field of ['available','is_default']) if(![0,1].includes(value[field] as number)) throw Error('Invalid flag.');
  for(const field of ['created','updated','sort_order']) if(!Number.isSafeInteger(value[field])) throw Error('Invalid number.');
  for(const field of ['starts','ends']) if(value[field]!==null && !Number.isSafeInteger(value[field])) throw Error('Invalid window.');
  if(value.starts!==null && value.ends!==null && Number(value.ends)<=Number(value.starts)) throw Error('Invalid window.');
  return value as Cosmetic;
}
export async function listCatalog(db: D1Database, account: string|null, now=Date.now()) {
  return (await db.prepare(`SELECT c.*, (c.is_default=1 OR EXISTS(SELECT 1 FROM owned_cosmetics o WHERE o.account=? AND o.cosmetic=c.id)) AS owned,
    EXISTS(SELECT 1 FROM equipped_cosmetics e WHERE e.account=? AND e.cosmetic=c.id) AS equipped
    FROM cosmetics c WHERE c.available=1 AND (c.starts IS NULL OR c.starts<=?) AND (c.ends IS NULL OR c.ends>?) ORDER BY c.sort_order,c.id`)
    .bind(account,account,now,now).all<Cosmetic & {owned:number;equipped:number}>()).results;
}
export async function listOwned(db: D1Database, account: string) {
  await requireAccount(db,account);
  // Defaults are permanent entitlements, including for accounts created later.
  return (await db.prepare('SELECT c.* FROM cosmetics c WHERE c.is_default=1 OR EXISTS(SELECT 1 FROM owned_cosmetics o WHERE o.account=? AND o.cosmetic=c.id) ORDER BY c.sort_order,c.id').bind(account).all<Cosmetic>()).results;
}
export async function getEquipped(db: D1Database, account: string) {
  await requireAccount(db,account);
  return (await db.prepare('SELECT category,cosmetic FROM equipped_cosmetics WHERE account=?').bind(account).all<{category:CosmeticCategory;cosmetic:string|null}>()).results;
}
export async function equip(db: D1Database, account: string, category: CosmeticCategory, cosmetic: string|null) {
  await requireAccount(db,account);
  if(!CATEGORIES.includes(category)) throw Error('Invalid category.');
  await db.prepare('INSERT INTO equipped_cosmetics(account,category,cosmetic) VALUES (?,?,?) ON CONFLICT(account,category) DO UPDATE SET cosmetic=excluded.cosmetic').bind(account,category,cosmetic).run();
}
