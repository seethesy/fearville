import { hash } from '@/lib/game/store';
import { textDefault } from '@/lib/ui-text/registry';
import { COMMANDS, parseCommand, usage } from '../commands';
import { ITEM_CATALOG } from '../catalog';
import { assertSQL } from '../lobbies';
import { reportPlan, reportQueue } from '../reports';
import {
  type Args,
  type Admin,
  type Plan,
  db,
  auditStatement,
  commit,
  publicError,
} from './audit.ts';
import { textHistory, textPlan } from './text.ts';
import { accountPlan } from './accounts.ts';
import { lobbyPlan } from './lobbies.ts';
export type Handler = (args: Args, admin: Admin) => Promise<Plan>;
export const handlers: Record<string, Handler> = {
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
  // FEAR-120: who is still on old builds before raising the minimum.
  clients: async (args) => {
    const days = Math.max(1, Number(args.days ?? 7));
    const since = new Date(Date.now() - (days - 1) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      statements: [],
      output: (
        await db()
          .prepare(
            'SELECT day,client,count FROM client_versions WHERE day>=? ORDER BY day DESC,count DESC LIMIT 500',
          )
          .bind(since)
          .all()
      ).results,
    };
  },
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
