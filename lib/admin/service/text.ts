import { textDefault, validateText } from '@/lib/ui-text/registry';
import { assertSQL } from '../lobbies';
import {
  db,
  type Plan,
  type Admin,
  commit,
  auditStatement,
  publicError,
} from './audit.ts';
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
