import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { FIXTURES, buildFixture } from '../lib/staging/fixtures.ts';
import { DEMO_ACCOUNT, demoStatements } from '../lib/staging/demo.ts';
import { view } from '../lib/game/view.ts';

const expected: Record<string, { phase: string; night?: number }> = {
  lobby: { phase: 'lobby' },
  'night-1': { phase: 'night', night: 1 },
  discovery: { phase: 'discovery' },
  discussion: { phase: 'discussion' },
  nomination: { phase: 'nomination' },
  defense: { phase: 'defense' },
  voting: { phase: 'voting' },
  'day-review': { phase: 'dayReview' },
  'rite-board': { phase: 'night', night: 2 },
  'rite-grid': { phase: 'night', night: 2 },
  'rite-ritual': { phase: 'night', night: 2 },
  'rite-lab': { phase: 'night', night: 2 },
  'ended-traveler': { phase: 'ended' },
  recap: { phase: 'lobby' },
  'hms-night-1': { phase: 'night', night: 1 },
  'hms-discovery': { phase: 'discovery' },
};

void test('every UI review fixture reaches its named state as a Sandbox table', () => {
  const now = Date.now();
  assert.equal(new Set(FIXTURES.map((f) => f.code)).size, FIXTURES.length);
  for (const f of FIXTURES) {
    assert.match(f.code, /^[A-Z]{6}$/);
    const g = buildFixture(f.id, now);
    const want = expected[f.id];
    assert.ok(want, f.id);
    assert.equal(g.code, f.code);
    assert.equal(g.sandbox, true, f.id);
    assert.equal(g.phase, want.phase, f.id);
    if (want.night) assert.equal(g.night, want.night, f.id);
    assert.equal(g.players.length, 12);
    assert.equal(
      g.script,
      f.id.startsWith('hms-') ? 'holyMoonStars' : 'horrors',
      f.id,
    );
    if (f.id.startsWith('rite-')) {
      assert.equal(g.rite?.status, 'open', f.id);
      assert.ok(
        g.rite!.squads.every((s) => s.kind === f.id.slice(5)),
        f.id,
      );
    }
    // Host and seat views build without throwing.
    view(g, { id: 'host', host: true }, 1, now, true);
    view(g, { id: g.players[0].id, host: false }, 1, now, true);
  }
  const ended = buildFixture('ended-traveler', now);
  assert.match(ended.winner, /Guardian\) also win/);
  assert.equal(buildFixture('recap', now).recaps?.length, 1);
  const voting = buildFixture('voting', now);
  assert.ok(Object.keys(voting.active?.votes ?? {}).length > 0);
});

void test('demo account data is idempotent and creates no sign-in credentials', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const file of readdirSync('drizzle')
      .filter((f) => f.endsWith('.sql'))
      .sort())
      db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    db.exec(
      "INSERT INTO sessions(code,state,version,created) VALUES ('QALOBY','{}',0,0)",
    );
    db.exec(demoStatements(1000000, 'QALOBY').join('\n'));
    db.exec(demoStatements(2000000, 'QALOBY').join('\n'));
    const n = (sql: string) => db.prepare(sql).get()?.n;
    assert.equal(n('SELECT COUNT(*) AS n FROM accounts'), 7);
    const mine = `'${DEMO_ACCOUNT}'`;
    assert.equal(
      n(
        `SELECT COUNT(*) AS n FROM friendships WHERE status='accepted' AND (requester=${mine} OR addressee=${mine})`,
      ),
      3,
    );
    assert.equal(
      n(`SELECT COUNT(*) AS n FROM friendships WHERE status='pending'`),
      2,
    );
    assert.equal(
      n(`SELECT COUNT(*) AS n FROM friendships WHERE status='blocked'`),
      1,
    );
    assert.equal(
      n(`SELECT COUNT(*) AS n FROM game_players WHERE account=${mine}`),
      3,
    );
    assert.equal(
      n(
        `SELECT COUNT(*) AS n FROM session_invites WHERE recipient=${mine} AND status='pending'`,
      ),
      1,
    );
    assert.equal(
      n(
        `SELECT COUNT(*) AS n FROM storyteller_ratings WHERE storyteller=${mine}`,
      ),
      2,
    );
    for (const table of ['identities', 'account_sessions', 'members'])
      assert.equal(n(`SELECT COUNT(*) AS n FROM ${table}`), 0);
  } finally {
    db.close();
  }
});
