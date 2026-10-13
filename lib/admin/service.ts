import { database } from '@/db';
import { hash, read } from '@/lib/game/store';
import { table } from '@/lib/game/table-client';
import { log } from '@/lib/game/engine';
import { statsFor } from '@/lib/social/stats';
import { levelProgress } from '@/lib/social/progression';
import { textDefault, validateText } from '@/lib/ui-text/registry';
import { COMMANDS, parseCommand, usage } from './commands';
import { ITEM_CATALOG } from './catalog';
import { adminAllowlist } from './access';
import { allowlisted } from './policy';
import {
  assertSQL,
  cancelGame,
  gameStatements,
  removalPlan,
  removeFromGame,
} from './lobbies';
import type { requireAdmin } from './auth';
import { reportPlan, reportQueue } from './reports';
import { auditValue, auditTarget, auditParameters } from './audit-value';
type Admin = Awaited<ReturnType<typeof requireAdmin>>;
export type Plan = {
  tables?: string[];
  statements: D1PreparedStatement[];
  target?: string;
  before?: unknown;
  after?: unknown;
  output: unknown;
};
type Args = Record<string, string | number>;
const db = database;
export function auditStatement(
  admin: string,
  action: string,
  target: string,
  parameters: unknown,
  result: string,
  before?: unknown,
  after?: unknown,
) {
  return db()
    .prepare(
      'INSERT INTO admin_audit(id,at,admin,action,target,parameters,result,before_value,after_value) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      Date.now(),
      admin,
      action,
      auditTarget(action, target),
      JSON.stringify(auditParameters(parameters)),
      result,
      JSON.stringify(auditValue(before ?? null)),
      JSON.stringify(auditValue(after ?? null)),
    );
}
async function commit(
  admin: Admin,
  action: string,
  parameters: unknown,
  plan: Plan,
) {
  // D1 batch is a transaction. Assertions fail closed on concurrent updates or
  // sign-out; a failed audit insert rolls back every mutation in this batch.
  await db().batch([
    assertSQL(
      'EXISTS (SELECT 1 FROM account_sessions WHERE hash=? AND account=? AND expires>?)',
      admin.sessionHash,
      admin.id,
      Date.now(),
    ),
    ...plan.statements,
    auditStatement(
      admin.id,
      action,
      plan.target ?? '',
      parameters,
      'success',
      plan.before,
      plan.after,
    ),
    db().prepare('DELETE FROM admin_assertions'),
  ]);
  await Promise.allSettled((plan.tables ?? []).map((code)=>table(code).notify(code)));
  return { output: plan.output };
}
export async function textHistory(key: string) {
  textDefault(key);
  return (
    await db()
      .prepare(
        'SELECT id,key,value,at,admin FROM ui_text_versions WHERE key=? ORDER BY id DESC LIMIT 200',
      )
      .bind(key)
      .all()
  ).results;
}
export async function textPlan(
  key: string,
  value: unknown,
  expected?: unknown,
): Promise<Plan> {
  const text = validateText(key, value);
  const before = await db()
    .prepare(
      'SELECT id,value FROM ui_text_versions WHERE key=? ORDER BY id DESC LIMIT 1',
    )
    .bind(key)
    .first<{ id: number; value: string }>();
  if (expected !== undefined && expected !== (before?.id ?? 0))
    throw Error('This text changed. Reload its history before saving.');
  return {
    target: key,
    before: before?.value ?? textDefault(key),
    after: text,
    output: { key, value: text },
    statements: [
      assertSQL(
        'COALESCE((SELECT MAX(id) FROM ui_text_versions WHERE key=?),0)=?',
        key,
        before?.id ?? 0,
      ),
      // Admin id is filled by the caller, not accepted from request data.
    ],
  };
}
export async function editText(admin: Admin, body: Record<string, unknown>) {
  const key = typeof body.key === 'string' ? body.key : '';
  try {
    if (!Number.isSafeInteger(body.version) || Number(body.version) < 0)
      throw Error('A current text version is required.');
    const value = body.reset === true ? textDefault(key) : body.value;
    const plan = await textPlan(key, value, body.version);
    plan.statements.push(
      db()
        .prepare(
          'INSERT INTO ui_text_versions(key,value,at,admin) VALUES (?,?,?,?)',
        )
        .bind(key, plan.after as string, Date.now(), admin.id),
    );
    return await commit(
      admin,
      body.reset === true ? 'text reset' : 'text save',
      body,
      plan,
    );
  } catch (e) {
    await auditStatement(admin.id, 'text edit', key, body, 'error', undefined, {
      error: publicError(e),
    }).run();
    throw e;
  }
}
export function publicError(e: unknown) {
  const s = e instanceof Error ? e.message : 'Request failed.';
  return s.includes('SQLITE') || s.startsWith('D1_')
    ? 'The data changed or could not be saved. Refresh and retry.'
    : s;
}
export async function targetAccount(value: string) {
  const row = await db()
    .prepare(
      'SELECT id,name,email,google_email,role,banned,muted_until,admin_revision FROM accounts WHERE id=? OR handle=? COLLATE NOCASE',
    )
    .bind(value, value.replace(/^@/, ''))
    .first<{
      id: string;
      name: string;
      email: string;
      google_email: string | null;
      role: string;
      banned: string | null;
      muted_until: number | null;
      admin_revision: number;
    }>();
  if (!row)
    throw Error(
      'Unknown account. Use a username or account ID; guests have no persistent account.',
    );
  if (
    row.role === 'admin' ||
    allowlisted(row.email, adminAllowlist()) ||
    allowlisted(row.google_email ?? '', adminAllowlist())
  )
    throw Error('The admin account cannot be targeted.');
  return row;
}
function accountGuard(a: { id: string; admin_revision: number }) {
  return [
    assertSQL(
      'EXISTS (SELECT 1 FROM accounts WHERE id=? AND admin_revision=?)',
      a.id,
      a.admin_revision,
    ),
    db()
      .prepare('UPDATE accounts SET admin_revision=admin_revision+1 WHERE id=?')
      .bind(a.id),
  ];
}
async function items(account: string) {
  return (
    await db()
      .prepare('SELECT item FROM account_items WHERE account=? ORDER BY item')
      .bind(account)
      .all<{ item: string }>()
  ).results.map((x) => x.item);
}
export const earnedXpSQL = `(COALESCE((SELECT SUM(base_xp+mvp_xp) FROM game_players WHERE account=?),0)+COALESCE((SELECT SUM(host_xp) FROM games WHERE host_account=?),0))`;
export async function accountPlan(name: string, args: Args): Promise<Plan> {
  const a = await targetAccount(String(args.account)),
    stats = await statsFor(a.id),
    owned = await items(a.id);
  const before = {
    xp: stats.progression.xp,
    level: stats.progression.level,
    elo: stats.elo,
    items: owned,
    banned: a.banned,
    mutedUntil: a.muted_until,
  };
  const plan: Plan = { target: a.id, before, statements: [], output: before };
  if(['ban','signout','reset'].includes(name)) plan.tables=(await db().prepare('SELECT DISTINCT code FROM account_seats WHERE account=?').bind(a.id).all<{code:string}>()).results.map((r)=>r.code);
  if (name === 'inspect') {
    plan.output = { id: a.id, name: a.name, ...before };
    return plan;
  }
  plan.statements.push(...accountGuard(a));
  if (name.startsWith('xp ') || name === 'reset') {
    const amount = Number(args.amount ?? 0);
    const xp =
      name === 'reset'
        ? 0
        : name === 'xp give'
          ? before.xp + amount
          : name === 'xp remove'
            ? Math.max(0, before.xp - amount)
            : amount;
    if (xp > 1_000_000_000)
      throw Error('XP balance cannot exceed 1,000,000,000.');
    plan.statements.push(
      assertSQL(
        `MAX(0,${earnedXpSQL}+COALESCE((SELECT xp_offset FROM admin_progression WHERE account=?),0))=?`,
        a.id,
        a.id,
        a.id,
        before.xp,
      ),
    );
    plan.statements.push(
      db()
        .prepare(
          `INSERT INTO admin_progression(account,xp_offset) VALUES (?,?-${earnedXpSQL}) ON CONFLICT(account) DO UPDATE SET xp_offset=excluded.xp_offset`,
        )
        .bind(a.id, xp, a.id, a.id),
    );
    plan.after = { ...before, ...levelProgress(xp) };
    if (name === 'reset') {
      plan.statements.push(
        db()
          .prepare(
            'UPDATE game_players SET elo_delta=0,rating_before=NULL,opponent_rating=NULL,team_rating=NULL WHERE account=?',
          )
          .bind(a.id),
      );
      plan.statements.push(
        db().prepare('DELETE FROM account_items WHERE account=?').bind(a.id),
      );
      plan.after = { ...(plan.after as object), elo: 1000, items: [] };
    }
  } else if (name === 'grant' || name === 'revoke') {
    const item = String(args.item);
    if (!ITEM_CATALOG.some((x) => x.id === item))
      throw Error('Unknown item. Use catalog for valid IDs.');
    plan.statements.push(
      name === 'grant'
        ? db()
            .prepare(
              'INSERT INTO account_items(account,item) VALUES (?,?) ON CONFLICT DO NOTHING',
            )
            .bind(a.id, item)
        : db()
            .prepare('DELETE FROM account_items WHERE account=? AND item=?')
            .bind(a.id, item),
    );
    plan.after = {
      ...before,
      items:
        name === 'grant'
          ? [...new Set([...owned, item])]
          : owned.filter((x) => x !== item),
    };
  } else if (name === 'mute' || name === 'unmute') {
    const until =
      name === 'unmute'
        ? null
        : args.minutes === undefined
          ? 8640000000000000
          : Date.now() + Number(args.minutes) * 60000;
    plan.statements.push(
      db()
        .prepare('UPDATE accounts SET muted_until=? WHERE id=?')
        .bind(until, a.id),
    );
    plan.after = { ...before, mutedUntil: until };
  } else if (name === 'ban' || name === 'unban' || name === 'signout') {
    if (name !== 'signout')
      plan.statements.push(
        db()
          .prepare('UPDATE accounts SET banned=? WHERE id=?')
          .bind(
            name === 'ban'
              ? String(args.reason ?? 'Banned by administration')
              : null,
            a.id,
          ),
      );
    if (name !== 'unban') {
      plan.statements.push(
        db()
          .prepare(
            'DELETE FROM members WHERE EXISTS (SELECT 1 FROM account_seats a WHERE a.account=? AND a.code=members.code AND a.player=members.player)',
          )
          .bind(a.id),
      );
      plan.statements.push(
        db()
          .prepare(
            name === 'ban'
              ? 'UPDATE account_sessions SET expires=0 WHERE account=?'
              : 'DELETE FROM account_sessions WHERE account=?',
          )
          .bind(a.id),
      );
      for (const table of ['native_codes', 'oauth_flows'])
        plan.statements.push(
          db().prepare(`DELETE FROM ${table} WHERE account=?`).bind(a.id),
        );
      plan.statements.push(
        db()
          .prepare('UPDATE account_profiles SET last_seen=0 WHERE account=?')
          .bind(a.id),
      );
    }
    if (name === 'ban') {
      const removal = await removalPlan(a.id);
      plan.statements.push(...removal.statements);
      plan.after = {
        ...before,
        banned: String(args.reason ?? 'Banned by administration'),
        removedFrom: removal.changed,
      };
    } else
      plan.after = {
        ...before,
        ...(name === 'unban' ? { banned: null } : { sessions: 'revoked' }),
      };
  } else throw Error('Command handler missing.');
  plan.output = plan.after;
  return plan;
}
async function lobbyPlan(name: string, args: Args): Promise<Plan> {
  if (name === 'lobbies') {
    const rows = await db()
      .prepare(
        "SELECT code,json_extract(state,'$.phase') AS phase,json_extract(state,'$.hostName') AS storyteller,json_extract(state,'$.script') AS script FROM sessions WHERE json_extract(state,'$.phase')<>'ended' ORDER BY created DESC LIMIT 100",
      )
      .all();
    return { statements: [], output: rows.results };
  }
  const code = String(args.lobby ?? '')
    .trim()
    .toUpperCase();
  if (name === 'kick') {
    const a = await targetAccount(String(args.account));
    const removal = await removalPlan(a.id, code || undefined);
    if (!removal.changed.length)
      throw Error('Account is not a member of that lobby.');
    return {
      statements: [...accountGuard(a), ...removal.statements],
      tables: removal.changed,
      target: a.id,
      before: { lobbies: removal.changed },
      after: { removed: true },
      output: { removedFrom: removal.changed },
    };
  }
  if (!/^[A-Z0-9]{6}$/.test(code))
    throw Error('Enter a valid six-character lobby code.');
  const { game, version } = await read(code);
  const describe = () => ({
    code,
    phase: game.phase,
    script: game.script,
    storyteller: game.hostName,
    players: game.players
      .filter((p) => !p.departed)
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        alive: p.alive,
        seat: p.seat,
      })),
  });
  const before = describe();
  if (name === 'lobby') return { statements: [], target: code, output: before };
  const extra: D1PreparedStatement[] = [];
  if (name === 'endgame') {
    if (game.phase === 'ended') throw Error('This game has already ended.');
    cancelGame(game, Date.now());
  } else if (name === 'storyteller') {
    const a = await targetAccount(String(args.account));
    if (a.banned !== null)
      throw Error('A banned account cannot be Storyteller.');
    const existing = await db()
      .prepare(
        'SELECT player,host FROM account_seats WHERE account=? AND code=?',
      )
      .bind(a.id, code)
      .first<{ player: string; host: number }>();
    if (existing?.host) throw Error('This account is already Storyteller.');
    // Preserve the old host's recorded credit, but rotate all host credentials.
    // The incoming host resumes from Saved lobbies, obtaining a fresh token.
    if (existing) {
      removeFromGame(game, existing.player, Date.now());
      extra.push(
        db()
          .prepare('DELETE FROM members WHERE code=? AND player=?')
          .bind(code, existing.player),
      );
    }
    extra.push(
      ...accountGuard(a),
      db().prepare('DELETE FROM members WHERE code=? AND host=1').bind(code),
      db()
        .prepare(
          'DELETE FROM account_seats WHERE code=? AND (host=1 OR account=?)',
        )
        .bind(code, a.id),
      db()
        .prepare(
          "INSERT INTO account_seats(id,account,code,player,host) VALUES (?,?,?,'host',1)",
        )
        .bind(code + ':host', a.id, code),
    );
    game.hostName = a.name;
    game.history = [];
    log(
      game,
      'Administration assigned a new Storyteller: ' + a.name + '.',
      Date.now(),
      true,
    );
  }
  return {
    statements: [...gameStatements(game, version), ...extra],
    tables: [code],
    target: code,
    before,
    after: describe(),
    output: describe(),
  };
}
type Handler = (args: Args, admin: Admin) => Promise<Plan>;
const handlers: Record<string, Handler> = {
  reports: async (args) => ({
    statements: [],
    output: await reportQueue(String(args.status ?? 'open')),
  }),
  report: (args, admin) => reportPlan(args, admin.id),
  help: async () => ({
    statements: [],
    output: COMMANDS.map((s) => ({
      usage: usage(s),
      description: s.description,
      confirmation: !!s.confirm,
    })),
  }),
  catalog: async () => ({ statements: [], output: ITEM_CATALOG }),
  ...Object.fromEntries(
    [
      'inspect',
      'xp give',
      'xp remove',
      'xp set',
      'grant',
      'revoke',
      'ban',
      'unban',
      'mute',
      'unmute',
      'signout',
      'reset',
    ].map((name) => [name, (args: Args) => accountPlan(name, args)]),
  ),
  ...Object.fromEntries(
    ['lobbies', 'lobby', 'kick', 'endgame', 'storyteller'].map((name) => [
      name,
      (args: Args) => lobbyPlan(name, args),
    ]),
  ),
  'text history': async (args) => ({
    statements: [],
    target: String(args.key),
    output: await textHistory(String(args.key)),
  }),
  'text revert': async (args, admin) => {
    const key = String(args.key);
    textDefault(key);
    const previous = await db()
      .prepare('SELECT value FROM ui_text_versions WHERE id=? AND key=?')
      .bind(Number(args.version), key)
      .first<{ value: string }>();
    if (!previous) throw Error('Unknown version for this key.');
    const plan = await textPlan(key, previous.value);
    plan.statements.push(
      db()
        .prepare(
          'INSERT INTO ui_text_versions(key,value,at,admin) VALUES (?,?,?,?)',
        )
        .bind(key, previous.value, Date.now(), admin.id),
    );
    return plan;
  },
};
export async function runCommand(
  admin: Admin,
  input: unknown,
  confirmation: unknown,
) {
  let action = 'invalid command',
    target = '';
  try {
    const { spec, args } = parseCommand(input);
    action = spec.name;
    target = String(args.account ?? args.lobby ?? args.key ?? '');
    const plan = await handlers[spec.name](args, admin);
    if (spec.confirm) {
      const digest = await hash(
        JSON.stringify({
          target: plan.target,
          before: plan.before,
          after: plan.after,
        }),
      );
      if (!confirmation) {
        const token = crypto.randomUUID();
        await db().batch([
          db()
            .prepare('DELETE FROM admin_confirmations WHERE expires<?')
            .bind(Date.now()),
          db()
            .prepare(
              'INSERT INTO admin_confirmations(hash,admin,session,command,digest,expires) VALUES (?,?,?,?,?,?)',
            )
            .bind(
              await hash(token),
              admin.id,
              admin.sessionHash,
              String(input),
              digest,
              Date.now() + 300000,
            ),
          auditStatement(
            admin.id,
            spec.name,
            plan.target ?? target,
            { input },
            'confirmation required',
            plan.before,
            plan.after,
          ),
        ]);
        return {
          confirmationRequired: true,
          confirmation: token,
          command: input,
          output: { before: plan.before, after: plan.after },
        };
      }
      if (typeof confirmation !== 'string' || confirmation.length > 100)
        throw Error('Invalid confirmation. Preview the command again.');
      const tokenHash = await hash(confirmation);
      const valid = await db()
        .prepare(
          'SELECT hash FROM admin_confirmations WHERE hash=? AND admin=? AND session=? AND command=? AND digest=? AND expires>?',
        )
        .bind(
          tokenHash,
          admin.id,
          admin.sessionHash,
          String(input),
          digest,
          Date.now(),
        )
        .first();
      if (!valid)
        throw Error(
          'Confirmation expired or the target changed. Preview the command again.',
        );
      plan.statements.unshift(
        assertSQL(
          'EXISTS (SELECT 1 FROM admin_confirmations WHERE hash=? AND expires>?)',
          tokenHash,
          Date.now(),
        ),
        db()
          .prepare('DELETE FROM admin_confirmations WHERE hash=?')
          .bind(tokenHash),
      );
    }
    return await commit(admin, spec.name, { input }, plan);
  } catch (e) {
    await auditStatement(
      admin.id,
      action,
      target,
      { input },
      'error',
      undefined,
      { error: publicError(e) },
    ).run();
    throw Error(publicError(e));
  }
}
export async function auditLog(params: URLSearchParams) {
  const filters: string[] = [],
    values: (string | number)[] = [];
  for (const key of ['action', 'target']) {
    const value = params.get(key);
    if (value) {
      filters.push(key + '=?');
      if (key === 'target') {
        const account = await db()
          .prepare('SELECT id FROM accounts WHERE id=? OR handle=?')
          .bind(value, value.replace(/^@/, ''))
          .first<{ id: string }>();
        values.push(account ? auditTarget('inspect', account.id) : value);
      } else values.push(value);
    }
  }
  for (const [key, operator] of [
    ['from', '>='],
    ['to', '<='],
  ] as const) {
    const value = params.get(key);
    if (value) {
      const date = Date.parse(value);
      if (!Number.isFinite(date))
        throw Error('Use an ISO date for audit filters.');
      filters.push('at' + operator + '?');
      values.push(date);
    }
  }
  const offset = Number(params.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw Error('Invalid page offset.');
  return (
    await db()
      .prepare(
        'SELECT * FROM admin_audit' +
          (filters.length ? ' WHERE ' + filters.join(' AND ') : '') +
          ' ORDER BY at DESC,id DESC LIMIT 100 OFFSET ?',
      )
      .bind(...values, offset)
      .all()
  ).results;
}
