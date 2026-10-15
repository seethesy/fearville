// FEAR-158: the developer account browsing the normal UI. Every change here
// goes through commit(), so it is audited and fails closed when the admin
// session ends. Sandbox tables are Sandbox games (never recorded in social
// history, stats, ranked or trust); observing a real table is read-only.
import { database } from '@/db';
import { currentEnvironment } from '@/lib/runtime/environment';
import { createStatements, prepareWrite } from '@/lib/game/part-store';
import { hash } from '@/lib/game/store';
import { OBSERVER_ID, uuid } from '@/lib/game/types';
import {
  FIXTURES,
  MAX_SEATS,
  MIN_SEATS,
  buildFixture,
  fixture,
  fixtureScripts,
  type FixtureScript,
} from '@/lib/staging/fixtures';
import { DEMO_ACCOUNT, demoStatements } from '@/lib/staging/demo';
import { ADMIN_SESSION_MS } from './policy';
import { commit, type Admin } from './service/audit.ts';
import { browseRequest, type BrowseRequest } from './browse-request.ts';

const db = database;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** What the admin console offers: every fixture, the scripts it supports, and the seat range. */
export function browseCatalog() {
  return {
    fixtures: FIXTURES.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      scripts: fixtureScripts(f.id),
    })),
    seats: { min: MIN_SEATS, max: MAX_SEATS, default: 12 },
  };
}

export type BrowseResult = {
  output: unknown;
  /** New table credential for the ct_session cookie. */
  token?: string;
  /** Clear the ct_session cookie. */
  clearTable?: boolean;
  redirect?: string;
};

function viewStatement(admin: Admin, viewer: string, account: string | null) {
  return db()
    .prepare(
      'INSERT INTO admin_views(session,admin,viewer,account,created) VALUES (?,?,?,?,?) ON CONFLICT(session) DO UPDATE SET viewer=excluded.viewer, account=excluded.account, created=excluded.created',
    )
    .bind(admin.sessionHash, admin.id, viewer, account, Date.now());
}

/** The synthetic demo account. In production its accounts have no handles. */
async function demoSeed(now: number, admin: Admin) {
  const lobby = await db()
    .prepare(
      "SELECT code FROM admin_table_grants WHERE admin=? AND mode='sandbox' LIMIT 1",
    )
    .bind(admin.id)
    .first<{ code: string }>();
  return demoStatements(
    now,
    lobby?.code,
    currentEnvironment() === 'production',
  ).map((sql) => db().prepare(sql));
}

/** Observe credentials are closed whenever the admin leaves or opens another table. */
function closeObserving(admin: Admin) {
  return [
    db()
      .prepare(
        "DELETE FROM members WHERE token_hash IN (SELECT token FROM admin_table_grants WHERE admin=? AND mode='observe')",
      )
      .bind(admin.id),
    db()
      .prepare(
        "DELETE FROM admin_table_grants WHERE admin=? AND mode='observe'",
      )
      .bind(admin.id),
  ];
}

async function freshCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    // Letters only: never collides with numeric player codes.
    const code =
      'AD' + Array.from(bytes, (n) => LETTERS[n % LETTERS.length]).join('');
    const exists = await db()
      .prepare('SELECT 1 FROM sessions WHERE code=?')
      .bind(code)
      .first();
    if (!exists) return code;
  }
  throw Error('Unable to create a sandbox table. Try again.');
}

async function openSandbox(
  admin: Admin,
  request: { fixture: string; script: FixtureScript; seats: number },
): Promise<BrowseResult> {
  const f = fixture(request.fixture);
  if (!f) throw Error('Unknown table state.');
  const now = Date.now();
  // One private sandbox table per admin, reset to the chosen state each time.
  const own = await db()
    .prepare(
      "SELECT code FROM admin_table_grants WHERE admin=? AND mode='sandbox' LIMIT 1",
    )
    .bind(admin.id)
    .first<{ code: string }>();
  const code = own?.code ?? (await freshCode());
  const game = buildFixture(f.id, now, {
    code,
    script: request.script,
    seats: request.seats,
    hostName: 'Admin Storyteller',
  });
  const existing = await db()
    .prepare('SELECT version FROM sessions WHERE code=?')
    .bind(code)
    .first<{ version: number }>();
  const write = existing
    ? (() => {
        // Bumping the version makes the live table re-import the new state.
        const w = prepareWrite(db(), game, existing.version);
        return [w.update, ...w.after];
      })()
    : createStatements(db(), game, now);
  const token = uuid() + uuid();
  const tokenHash = await hash(token);
  const result = await commit(
    admin,
    'browse sandbox',
    { fixture: f.id, script: request.script, seats: request.seats },
    {
      tables: [code],
      target: code,
      statements: [
        ...write,
        db().prepare('DELETE FROM members WHERE code=?').bind(code),
        db().prepare('DELETE FROM session_snapshots WHERE code=?').bind(code),
        db().prepare('DELETE FROM admin_table_grants WHERE code=?').bind(code),
        ...closeObserving(admin),
        db()
          .prepare(
            'INSERT INTO members (token_hash,code,player,host,expires) VALUES (?,?,?,1,?)',
          )
          .bind(tokenHash, code, 'host', now + ADMIN_SESSION_MS),
        db()
          .prepare(
            "INSERT INTO admin_table_grants(token,admin,code,mode,created) VALUES (?,?,?,'sandbox',?)",
          )
          .bind(tokenHash, admin.id, code, now),
        ...(await demoSeed(now, admin)),
        viewStatement(admin, 'storyteller', DEMO_ACCOUNT),
      ],
      output: {
        code,
        fixture: f.id,
        script: request.script,
        seats: request.seats,
      },
    },
  );
  return { ...result, token, redirect: '/table' };
}

async function observe(admin: Admin, code: string): Promise<BrowseResult> {
  const table = await db()
    .prepare('SELECT 1 FROM sessions WHERE code=?')
    .bind(code)
    .first();
  if (!table) throw Error('No table has that code.');
  const now = Date.now();
  const token = uuid() + uuid();
  const tokenHash = await hash(token);
  const result = await commit(
    admin,
    'browse observe',
    { code },
    {
      tables: [code],
      target: code,
      statements: [
        ...closeObserving(admin),
        db()
          .prepare(
            'INSERT INTO members (token_hash,code,player,host,expires) VALUES (?,?,?,0,?)',
          )
          .bind(tokenHash, code, OBSERVER_ID, now + ADMIN_SESSION_MS),
        db()
          .prepare(
            "INSERT INTO admin_table_grants(token,admin,code,mode,created) VALUES (?,?,?,'observe',?)",
          )
          .bind(tokenHash, admin.id, code, now),
        viewStatement(admin, 'observer', null),
      ],
      output: { code, observing: true },
    },
  );
  return { ...result, token, redirect: '/table' };
}

export async function browse(
  admin: Admin,
  body: unknown,
): Promise<BrowseResult> {
  const request: BrowseRequest = browseRequest(body);
  if (request.op === 'sandbox') return openSandbox(admin, request);
  if (request.op === 'observe') return observe(admin, request.code);
  if (request.op === 'exit') {
    const result = await commit(
      admin,
      'browse exit',
      {},
      {
        statements: [
          ...closeObserving(admin),
          db()
            .prepare('DELETE FROM admin_views WHERE session=? OR admin=?')
            .bind(admin.sessionHash, admin.id),
        ],
        output: { viewer: null },
      },
    );
    return { ...result, clearTable: true, redirect: '/' };
  }
  // view as guest or player; Storyteller opens the sandbox lobby.
  if (request.viewer === 'storyteller')
    return openSandbox(admin, {
      fixture: 'lobby',
      script: 'horrors',
      seats: 12,
    });
  const now = Date.now();
  const result = await commit(
    admin,
    'browse view',
    { viewer: request.viewer },
    {
      target: request.viewer,
      statements: [
        ...closeObserving(admin),
        ...(request.viewer === 'player' ? await demoSeed(now, admin) : []),
        viewStatement(
          admin,
          request.viewer,
          request.viewer === 'player' ? DEMO_ACCOUNT : null,
        ),
      ],
      output: { viewer: request.viewer },
    },
  );
  return { ...result, clearTable: true, redirect: '/' };
}
