import { database } from '@/db';
import { table } from '@/lib/game/table-client';
import { assertSQL } from '../lobbies';
import type { requireAdmin } from '../auth';
import { auditValue, auditTarget, auditParameters } from '../audit-value';
export type Admin = Awaited<ReturnType<typeof requireAdmin>>;
export type Plan = {
  tables?: string[];
  statements: D1PreparedStatement[];
  target?: string;
  before?: unknown;
  after?: unknown;
  output: unknown;
};
export type Args = Record<string, string | number>;
export const db = database;
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
export async function commit(
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
  await Promise.allSettled(
    (plan.tables ?? []).map((code) => table(code).notify(code)),
  );
  return { output: plan.output };
}
export function publicError(e: unknown) {
  const s = e instanceof Error ? e.message : 'Request failed.';
  return s.includes('SQLITE') || s.startsWith('D1_')
    ? 'The data changed or could not be saved. Refresh and retry.'
    : s;
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
