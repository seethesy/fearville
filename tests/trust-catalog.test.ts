import test from 'node:test';
import assert from 'node:assert/strict';
import { trustDB } from './trust-db.ts';
import {
  listCatalog,
  listOwned,
  equip,
  getEquipped,
  validateCosmetic,
} from '../lib/trust/catalog.ts';
import { AVATARS } from '../lib/game/avatars.ts';
import { DEATH_EFFECTS } from '../lib/game/cosmetics.ts';
void test('every existing cosmetic stays free for existing and future accounts', async () => {
  const { db } = trustDB([
    '0014_trust_ledger.sql',
    '0015_cosmetics_catalog.sql',
  ]);
  const items = await listOwned(db, 'a');
  assert.equal(items.length, AVATARS.length + DEATH_EFFECTS.length);
  for (const id of [...AVATARS, ...DEATH_EFFECTS].map((a) => a.id))
    assert.ok(
      items.some(
        (i) => i.preview === id && i.price === 0 && i.is_default === 1,
      ),
    );
  for (const item of items) validateCosmetic(item);
  assert.equal((await listCatalog(db, null)).length, items.length);
  await equip(db, 'a', 'avatar_icon', 'avatar-ghost');
  assert.equal((await getEquipped(db, 'a'))[0].cosmetic, 'avatar-ghost');
  await assert.rejects(
    equip(db, 'a', 'death_animation', 'avatar-ghost'),
    /FOREIGN KEY/,
  );
});
void test('ownership, category and presentation validation; withdrawn items remain owned', async () => {
  const { db, sqlite } = trustDB([
    '0014_trust_ledger.sql',
    '0015_cosmetics_catalog.sql',
  ]);
  sqlite.exec(
    "INSERT INTO cosmetics(id,category,name,price,preview,created,updated) VALUES ('test','profile_flair','Test',10,'test',0,0)",
  );
  await assert.rejects(equip(db, 'a', 'profile_flair', 'test'), /not_owned/);
  sqlite.exec("INSERT INTO owned_cosmetics VALUES ('a','test',0,'purchase')");
  assert.throws(
    () =>
      sqlite.exec(
        "INSERT INTO owned_cosmetics VALUES ('a','test',1,'purchase')",
      ),
    /UNIQUE/,
  );
  sqlite.exec("UPDATE cosmetics SET available=0 WHERE id='test'");
  assert.ok((await listOwned(db, 'a')).some((i) => i.id === 'test'));
  assert.ok(!(await listCatalog(db, 'a')).some((i) => i.id === 'test'));
  await equip(db, 'a', 'profile_flair', 'test');
  await equip(db, 'a', 'profile_flair', null);
  const item = (await listOwned(db, 'a'))[0];
  assert.throws(
    () => validateCosmetic({ ...item, winBonus: 1 }),
    /Presentation/,
  );
  assert.throws(() => validateCosmetic({ ...item, price: -1 }), /price/);
});
