// FEAR-161: staging-only UI review tools. Returns 404 in production.
import { database } from '@/db';
import { currentEnvironment } from '@/lib/runtime/environment';
import {
  accountCookie,
  cookie as accountCookieHeader,
  createAccountSession,
} from '@/lib/accounts/service';
import { createStatements, prepareWrite } from '@/lib/game/part-store';
import { memberCookie, memberExpiry } from '@/lib/game/join';
import { table } from '@/lib/game/table-client';
import {
  checkOrigin,
  errorResponse,
  hash,
  json,
  limited,
} from '@/lib/game/store';
import { uuid } from '@/lib/game/types';
import { FIXTURES, buildFixture, fixture } from '@/lib/staging/fixtures';
import { DEMO_ACCOUNT, demoStatements } from '@/lib/staging/demo';

const notFound = () => json({ error: 'Not found.' }, 404);
const allowed = () => currentEnvironment() !== 'production';

export function GET() {
  if (!allowed()) return notFound();
  return json({ fixtures: FIXTURES });
}

/** Replace (or create) a fixture table and return a fresh host credential. */
async function loadFixture(id: string) {
  const f = fixture(id);
  if (!f) throw Error('Unknown fixture.');
  const db = database();
  const now = Date.now();
  const game = buildFixture(f.id, now);
  const token = uuid() + uuid();
  const existing = await db
    .prepare('SELECT version FROM sessions WHERE code=?')
    .bind(f.code)
    .first<{ version: number }>();
  const write = existing
    ? (() => {
        // Bumping the version makes the live table re-import the new state.
        const w = prepareWrite(db, game, existing.version);
        return [w.update, ...w.after];
      })()
    : createStatements(db, game, now);
  await db.batch([
    ...write,
    db.prepare('DELETE FROM members WHERE code=?').bind(f.code),
    db.prepare('DELETE FROM session_snapshots WHERE code=?').bind(f.code),
    db
      .prepare(
        'INSERT INTO members (token_hash,code,player,host,expires) VALUES (?,?,?,1,?)',
      )
      .bind(await hash(token), f.code, 'host', memberExpiry()),
  ]);
  await table(f.code).notify(f.code);
  return { code: f.code, token };
}

export async function POST(r: Request) {
  try {
    if (!allowed()) return notFound();
    checkOrigin(r);
    await limited(r, 'staging', 30);
    const raw = await r.text();
    if (raw.length > 2000) throw Error('Request is too large.');
    const body = JSON.parse(raw);
    if (body.action === 'open') {
      const { code, token } = await loadFixture(String(body.fixture));
      return json({ code }, 200, { 'Set-Cookie': memberCookie(r, token) });
    }
    if (body.action === 'demo') {
      const db = database();
      const lobby = fixture('lobby')!.code;
      const exists = await db
        .prepare('SELECT 1 FROM sessions WHERE code=?')
        .bind(lobby)
        .first();
      if (!exists) await loadFixture('lobby');
      await db.batch(
        demoStatements(Date.now(), lobby).map((sql) => db.prepare(sql)),
      );
      const token = await createAccountSession(DEMO_ACCOUNT, 'staging-demo');
      return json({ account: DEMO_ACCOUNT }, 200, {
        'Set-Cookie': accountCookieHeader(accountCookie, token),
      });
    }
    throw Error('Unknown staging action.');
  } catch (e) {
    return errorResponse(e);
  }
}
