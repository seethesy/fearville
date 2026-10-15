CREATE TABLE cosmetics (
 id TEXT PRIMARY KEY NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('avatar_icon','death_animation','table_theme','profile_flair')),
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 price INTEGER NOT NULL CHECK(typeof(price)='integer' AND price>=0),
 tier TEXT NOT NULL DEFAULT 'standard', preview TEXT NOT NULL,
 available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)),
 starts INTEGER, ends INTEGER,
 sort_order INTEGER NOT NULL DEFAULT 0,
 is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
 created INTEGER NOT NULL, updated INTEGER NOT NULL,
 CHECK(ends IS NULL OR starts IS NULL OR ends>starts),
 CHECK(is_default=0 OR price=0), UNIQUE(id,category)
);
CREATE TABLE owned_cosmetics (
 account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 cosmetic TEXT NOT NULL REFERENCES cosmetics(id),
 acquired INTEGER NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('purchase','admin','default')),
 PRIMARY KEY(account,cosmetic)
);
CREATE TABLE equipped_cosmetics (
 account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 category TEXT NOT NULL,
 cosmetic TEXT,
 PRIMARY KEY(account,category),
 FOREIGN KEY(cosmetic,category) REFERENCES cosmetics(id,category)
);
CREATE TRIGGER equipped_validate_insert BEFORE INSERT ON equipped_cosmetics
WHEN NEW.cosmetic IS NOT NULL AND NOT EXISTS(SELECT 1 FROM owned_cosmetics WHERE account=NEW.account AND cosmetic=NEW.cosmetic)
AND NOT EXISTS(SELECT 1 FROM cosmetics WHERE id=NEW.cosmetic AND is_default=1)
BEGIN SELECT RAISE(ABORT,'not_owned'); END;
CREATE TRIGGER equipped_validate_update BEFORE UPDATE ON equipped_cosmetics
WHEN NEW.cosmetic IS NOT NULL AND NOT EXISTS(SELECT 1 FROM owned_cosmetics WHERE account=NEW.account AND cosmetic=NEW.cosmetic)
AND NOT EXISTS(SELECT 1 FROM cosmetics WHERE id=NEW.cosmetic AND is_default=1)
BEGIN SELECT RAISE(ABORT,'not_owned'); END;
INSERT INTO cosmetics(id,category,name,price,preview,is_default,created,updated) VALUES
 ('avatar-raven','avatar_icon','Raven',0,'raven',1,0,0),
 ('avatar-ghost','avatar_icon','Ghost',0,'ghost',1,0,0),
 ('avatar-moon','avatar_icon','Moon',0,'moon',1,0,0),
 ('avatar-cat','avatar_icon','Black cat',0,'cat',1,0,0),
 ('avatar-skull','avatar_icon','Skull',0,'skull',1,0,0),
 ('avatar-flame','avatar_icon','Ember',0,'flame',1,0,0),
 ('avatar-rose','avatar_icon','Night rose',0,'rose',1,0,0),
 ('avatar-eye','avatar_icon','Watcher',0,'eye',1,0,0),
 ('avatar-bat','avatar_icon','Nightwing',0,'bat',1,0,0),
 ('avatar-spider','avatar_icon','Widow',0,'spider',1,0,0),
 ('avatar-wolf','avatar_icon','Moonhound',0,'wolf',1,0,0),
 ('avatar-crown','avatar_icon','Lost monarch',0,'crown',1,0,0),
 ('avatar-dagger','avatar_icon','Silver blade',0,'dagger',1,0,0),
 ('avatar-lantern','avatar_icon','Lamplighter',0,'lantern',1,0,0),
 ('avatar-key','avatar_icon','Gatekeeper',0,'key',1,0,0),
 ('avatar-book','avatar_icon','Spellbinder',0,'book',1,0,0),
 ('avatar-hourglass','avatar_icon','Timekeeper',0,'hourglass',1,0,0),
 ('avatar-gem','avatar_icon','Amethyst',0,'gem',1,0,0),
 ('avatar-mushroom','avatar_icon','Toadstool',0,'mushroom',1,0,0),
 ('avatar-mask','avatar_icon','Masquerade',0,'mask',1,0,0),
 ('death-spirit','death_animation','Departing spirit',0,'spirit',1,0,0),
 ('death-embers','death_animation','Last ember',0,'embers',1,0,0),
 ('death-petals','death_animation','Fallen petals',0,'petals',1,0,0),
 ('death-mist','death_animation','Into the fog',0,'mist',1,0,0),
 ('death-none','death_animation','Quiet farewell',0,'none',1,0,0);
