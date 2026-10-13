import { database } from '@/db';
import { read, hash } from '@/lib/game/store';
import { assertSQL, gameStatements } from './lobbies';
import { accountPlan, targetAccount, type Plan } from './service';

type Report = {
  id: string;
  kind: string;
  reason: string;
  note: string;
  target_account: string | null;
  target_name: string;
  code: string | null;
  game: string | null;
  message_id: string | null;
  content: string;
  status: string;
  resolution: string | null;
};
export async function reportQueue(status = 'open', offset = 0) {
  if (!['open', 'dismissed', 'actioned', 'all'].includes(status))
    throw Error('Choose open, dismissed, actioned or all reports.');
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw Error('Invalid report page.');
  return (
    await database()
      .prepare(
        `SELECT * FROM player_reports ${status === 'all' ? '' : 'WHERE status=?'} ORDER BY created ASC,id ASC LIMIT 100 OFFSET ?`,
      )
      .bind(...(status === 'all' ? [offset] : [status, offset]))
      .all()
  ).results;
}

export async function reportPlan(
  args: Record<string, string | number>,
  admin: string,
): Promise<Plan> {
  const decision = String(args.decision);
  if (!['dismiss', 'warn', 'remove', 'suspend'].includes(decision))
    throw Error('Choose dismiss, warn, remove or suspend.');
  const report = await database()
    .prepare('SELECT * FROM player_reports WHERE id=?')
    .bind(String(args.report))
    .first<Report>();
  if (!report) throw Error('Unknown report.');
  if (report.status !== 'open')
    throw Error('This report has already been resolved.');
  const note = String(args.note ?? `Report reviewed: ${report.reason}`);
  const statements = [
    assertSQL(
      "EXISTS (SELECT 1 FROM player_reports WHERE id=? AND status='open' AND content=? AND target_account IS ?)",
      report.id,
      report.content,
      report.target_account,
    ),
  ];
  const before: Record<string, unknown> = {
    report: report.id,
    status: report.status,
    kind: report.kind,
    contentDigest: await hash(report.content),
  };
  if (decision === 'warn' || decision === 'suspend') {
    if (!report.target_account)
      throw Error('This report has no registered account to warn or suspend.');
    const target = await targetAccount(report.target_account);
    before.targetRevision = target.admin_revision;
    statements.push(
      assertSQL(
        "EXISTS (SELECT 1 FROM accounts WHERE id=? AND admin_revision=? AND role='player')",
        target.id,
        target.admin_revision,
      ),
    );
    if (decision === 'suspend') {
      const ban = await accountPlan('ban', {
        account: report.target_account,
        reason: note,
      });
      statements.push(...ban.statements);
      before.account = ban.before;
    }
  }
  if (decision === 'remove') {
    if (report.target_account) {
      const target = await targetAccount(report.target_account);
      before.targetRevision = target.admin_revision;
      statements.push(assertSQL("EXISTS (SELECT 1 FROM accounts WHERE id=? AND admin_revision=? AND role='player')", target.id, target.admin_revision));
    }
    if (report.kind === 'player') {
      if (report.target_account)
        statements.push(
          database()
            .prepare('UPDATE accounts SET handle=NULL WHERE id=? AND handle=?')
            .bind(report.target_account, report.content),
        );
    } else if (report.kind === 'rating') {
      if (report.target_account && report.game)
        statements.push(
          database()
            .prepare(
              "UPDATE storyteller_ratings SET comment='' WHERE game=? AND rater=? AND comment=?",
            )
            .bind(report.game, report.target_account, report.content),
        );
    } else if (report.kind === 'chat' && report.code && report.message_id) {
      const exists = await database()
        .prepare('SELECT code FROM sessions WHERE code=?')
        .bind(report.code)
        .first();
      if (exists) {
        const { game, version } = await read(report.code);
        before.sourceDigest = await hash(
          JSON.stringify(
            game.messages.find((m) => m.id === report.message_id) ?? null,
          ),
        );
        game.messages = game.messages.filter((m) => m.id !== report.message_id);
        for (const recap of game.recaps ?? [])
          recap.messages = recap.messages?.filter(
            (m) => m.id !== report.message_id,
          );
        game.history = [];
        statements.push(...gameStatements(game, version));
      }
    }
  }
  const status = decision === 'dismiss' ? 'dismissed' : 'actioned';
  const resolution = `${decision}: ${note}`;
  statements.push(
    database()
      .prepare(
        `UPDATE player_reports SET status=?,resolved_by=?,resolved_at=?,resolution=?${decision === 'remove' ? ",content=''" : ''} WHERE id=?`,
      )
      .bind(status, admin, Date.now(), resolution, report.id),
  );
  return {
    statements,
    target: report.id,
    before,
    after: { decision, status, resolution },
    output: { report: report.id, decision, status },
  };
}
