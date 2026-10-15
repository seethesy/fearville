// FEAR-122: view and edit remote switches from the admin console. Every
// change is audited in the current environment's admin_audit; kills need a
// confirmation like other destructive console commands.
import { hash } from '@/lib/game/store';
import { table } from '@/lib/game/table-client';
import { currentEnvironment } from '@/lib/runtime/environment';
import type { RuntimeEnvironment } from '@/lib/runtime/config';
import {
  SWITCHES,
  fromRows,
  isFlagKey,
  parseValue,
  switchDef,
} from '@/lib/flags/catalog';
import {
  editableEnvironments,
  flagRows,
  forgetFlags,
  upsertFlag,
} from '@/lib/flags/flags';
import { assertSQL } from '../lobbies';
import {
  db,
  type Admin,
  auditStatement,
  commit,
  publicError,
} from './audit.ts';

export async function flagsOverview() {
  const environments = await Promise.all(
    editableEnvironments().map(async (name) => {
      const rows = await flagRows(name);
      return { name, rows, flags: fromRows(rows) };
    }),
  );
  return { catalog: SWITCHES, environments };
}

function environmentOf(value: unknown): RuntimeEnvironment {
  const allowed = editableEnvironments();
  const environment = (value ?? currentEnvironment()) as RuntimeEnvironment;
  if (!allowed.includes(environment))
    throw Error('This console cannot edit that environment.');
  return environment;
}

/** Running tables re-check switches (kills) and push fresh views. */
async function notifyRunningTables() {
  const rows = await db()
    .prepare(
      "SELECT code FROM sessions WHERE json_extract(state,'$.phase') NOT IN ('lobby','ended') LIMIT 500",
    )
    .all<{ code: string }>();
  await Promise.allSettled(
    rows.results.map((r) => table(r.code).notify(r.code)),
  );
}

export async function setFlag(admin: Admin, body: Record<string, unknown>) {
  const key = body.key;
  let environment: RuntimeEnvironment = currentEnvironment();
  const action = 'switch set';
  try {
    if (!isFlagKey(key)) throw Error('Unknown switch.');
    environment = environmentOf(body.environment);
    const value = parseValue(key, body.value);
    const before = (await flagRows(environment)).find((r) => r.key === key);
    const target = `${environment}:${key}`;
    const plan = {
      target,
      before: before ? JSON.parse(before.value) : null,
      after: value,
      output: { environment, key, value },
      statements: [] as D1PreparedStatement[],
    };
    if (value === 'kill') {
      const digest = await hash(JSON.stringify({ target, value }));
      if (!body.confirmation) {
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
              'switch kill ' + target,
              digest,
              Date.now() + 300000,
            ),
          auditStatement(
            admin.id,
            'switch kill',
            target,
            { environment, key, value },
            'confirmation required',
            plan.before,
            value,
          ),
        ]);
        return {
          confirmationRequired: true,
          confirmation: token,
          output: {
            environment,
            key,
            label: switchDef(key)?.label,
            effect:
              'Kill turns this off and ends it in every running game in this environment.',
          },
        };
      }
      if (
        typeof body.confirmation !== 'string' ||
        body.confirmation.length > 100
      )
        throw Error('Invalid confirmation. Try the kill again.');
      const tokenHash = await hash(body.confirmation);
      const valid = await db()
        .prepare(
          'SELECT hash FROM admin_confirmations WHERE hash=? AND admin=? AND session=? AND command=? AND digest=? AND expires>?',
        )
        .bind(
          tokenHash,
          admin.id,
          admin.sessionHash,
          'switch kill ' + target,
          digest,
          Date.now(),
        )
        .first();
      if (!valid) throw Error('Confirmation expired. Try the kill again.');
      plan.statements.push(
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
    const local = environment === currentEnvironment();
    // Same database: the change and its audit entry commit together.
    if (local)
      plan.statements.push(upsertFlag(environment, key, value, admin.id));
    const result = await commit(
      admin,
      value === 'kill' ? 'switch kill' : action,
      { environment, key, value },
      plan,
    );
    // Another environment's database: audit first, then write; a failed
    // write is audited as an error below.
    if (!local) await upsertFlag(environment, key, value, admin.id).run();
    forgetFlags(environment);
    if (local && (value === 'kill' || key === 'maintenance'))
      await notifyRunningTables();
    return result;
  } catch (e) {
    await auditStatement(
      admin.id,
      action,
      `${environment}:${String(key)}`,
      { environment, key, value: body.value },
      'error',
      undefined,
      { error: publicError(e) },
    ).run();
    throw Error(publicError(e));
  }
}
