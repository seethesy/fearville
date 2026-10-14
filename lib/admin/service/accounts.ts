import { statsFor } from '@/lib/social/stats';
import { levelProgress } from '@/lib/social/progression';
import { ITEM_CATALOG } from '../catalog';
import { adminAllowlist } from '../access';
import { allowlisted } from '../policy';
import { assertSQL, removalPlan } from '../lobbies';
import { db, type Args, type Plan } from './audit.ts';
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
export function accountGuard(a: { id: string; admin_revision: number }) {
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
export async function items(account: string) {
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
  if (['ban', 'signout', 'reset'].includes(name))
    plan.tables = (
      await db()
        .prepare('SELECT DISTINCT code FROM account_seats WHERE account=?')
        .bind(a.id)
        .all<{ code: string }>()
    ).results.map((r) => r.code);
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
