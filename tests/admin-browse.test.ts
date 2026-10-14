// FEAR-158: admin browsing the normal UI (view-as, sandbox tables, observing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { browseRequest } from '../lib/admin/browse-request.ts';
import {
  FIXTURES,
  MAX_SEATS,
  MIN_SEATS,
  buildFixture,
  fixtureScripts,
} from '../lib/staging/fixtures.ts';
import { DEMO_ACCOUNT, demoStatements } from '../lib/staging/demo.ts';
import { povViewer } from '../lib/game/pov.ts';
import { view } from '../lib/game/view.ts';
import { newSandboxGame } from '../lib/game/sandbox.ts';
import { newGame, newPlayer } from '../lib/game/types.ts';

void test('browse requests are validated', () => {
  assert.deepEqual(browseRequest({ op: 'exit' }), { op: 'exit' });
  assert.deepEqual(browseRequest({ op: 'view', viewer: 'player' }), {
    op: 'view',
    viewer: 'player',
  });
  assert.throws(() => browseRequest({ op: 'view', viewer: 'admin' }));
  assert.throws(() => browseRequest({ op: 'view', viewer: 'observer' }));
  assert.deepEqual(
    browseRequest({
      op: 'sandbox',
      fixture: 'voting',
      script: 'holyMoonStars',
      seats: '9',
    }),
    { op: 'sandbox', fixture: 'voting', script: 'holyMoonStars', seats: 9 },
  );
  for (const seats of [MIN_SEATS - 1, MAX_SEATS + 1, 7.5, 'x'])
    assert.throws(() =>
      browseRequest({
        op: 'sandbox',
        fixture: 'lobby',
        script: 'horrors',
        seats,
      }),
    );
  // The Guardian win only exists in Horrors of Fearville.
  assert.throws(() =>
    browseRequest({
      op: 'sandbox',
      fixture: 'ended-traveler',
      script: 'holyMoonStars',
      seats: 12,
    }),
  );
  assert.throws(() =>
    browseRequest({
      op: 'sandbox',
      fixture: 'nope',
      script: 'horrors',
      seats: 12,
    }),
  );
  assert.deepEqual(browseRequest({ op: 'observe', code: ' 123456 ' }), {
    op: 'observe',
    code: '123456',
  });
  assert.throws(() => browseRequest({ op: 'observe', code: "1'; --" }));
  assert.throws(() => browseRequest({ op: 'nope' }));
});

void test('every state builds for each script at the edge seat counts', () => {
  const now = Date.now();
  for (const f of FIXTURES)
    for (const script of fixtureScripts(f.id))
      for (const seats of [MIN_SEATS, 9, MAX_SEATS]) {
        if (f.id === 'rite-ritual' && seats % 3) continue; // see next test
        const g = buildFixture(f.id, now, {
          code: 'ADTEST',
          script,
          seats,
          hostName: 'Admin Storyteller',
        });
        const label = `${f.id} ${script} ${seats}`;
        assert.equal(g.code, 'ADTEST', label);
        assert.equal(g.sandbox, true, label);
        assert.equal(g.players.length, seats, label);
        assert.equal(g.script, script, label);
        assert.equal(g.hostName, 'Admin Storyteller', label);
      }
});

void test('a Ritual-only state needs a player count divisible by three', () => {
  assert.throws(
    () => buildFixture('rite-ritual', Date.now(), { seats: 10 }),
    /divisible by three/,
  );
  assert.equal(
    buildFixture('rite-ritual', Date.now(), { seats: 15 }).rite?.status,
    'open',
  );
});

void test('fixture defaults are unchanged for the staging review page', () => {
  const g = buildFixture('hms-discovery', Date.now());
  assert.equal(g.code, 'QAHMSD');
  assert.equal(g.script, 'holyMoonStars');
  assert.equal(g.players.length, 12);
  assert.equal(newSandboxGame('X', 'Y').players.length, 6);
});

void test('observers see the Storyteller view or any seat, and keep the observer flag', () => {
  const g = newGame('123456', 'Real Storyteller');
  g.players = [
    { ...newPlayer('Ana', 1) },
    { ...newPlayer('Ben', 2), departed: true },
  ];
  const observer = { id: 'admin-observer', host: false, observer: true };
  assert.deepEqual(povViewer(g, observer, null), {
    id: 'host',
    host: true,
    observer: true,
  });
  assert.deepEqual(povViewer(g, observer, g.players[0].id), {
    id: g.players[0].id,
    host: false,
    observer: true,
  });
  // A departed seat falls back to the Storyteller view.
  assert.equal(povViewer(g, observer, g.players[1].id).id, 'host');
  // A real Storyteller cannot borrow a player's view outside the Sandbox.
  const host = { id: 'host', host: true };
  assert.deepEqual(povViewer(g, host, g.players[0].id), host);
  const now = Date.now();
  assert.equal(view(g, povViewer(g, observer, null), 1, now).observer, true);
  assert.equal(view(g, host, 1, now).observer, false);
});

void test('the production demo account is never discoverable by handle', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    db.exec(demoStatements(1000000, undefined, true).join('\n'));
    db.exec(demoStatements(2000000, undefined, true).join('\n'));
    const n = (sql: string) => db.prepare(sql).get()?.n;
    assert.equal(n('SELECT COUNT(*) AS n FROM accounts'), 7);
    assert.equal(
      n('SELECT COUNT(*) AS n FROM accounts WHERE handle IS NOT NULL'),
      0,
    );
    // Without a lobby there is no invitation to point at.
    assert.equal(n('SELECT COUNT(*) AS n FROM session_invites'), 0);
    assert.equal(
      n(
        `SELECT COUNT(*) AS n FROM game_players WHERE account='${DEMO_ACCOUNT}'`,
      ),
      3,
    );
    for (const table of ['identities', 'account_sessions', 'members'])
      assert.equal(n(`SELECT COUNT(*) AS n FROM ${table}`), 0);
    // Admin views and table grants go away with the admin account.
    db.exec(
      "INSERT INTO accounts(id,name,email,role,created) VALUES ('adm','Admin','a@example.invalid','admin',0)",
    );
    db.exec(
      `INSERT INTO admin_views(session,admin,viewer,account,created) VALUES ('s','adm','player','${DEMO_ACCOUNT}',0)`,
    );
    db.exec(
      "INSERT INTO admin_table_grants(token,admin,code,mode,created) VALUES ('t','adm','ADXXXX','sandbox',0)",
    );
    db.exec("DELETE FROM accounts WHERE id='adm'");
    assert.equal(n('SELECT COUNT(*) AS n FROM admin_views'), 0);
    assert.equal(n('SELECT COUNT(*) AS n FROM admin_table_grants'), 0);
  } finally {
    db.close();
  }
});
