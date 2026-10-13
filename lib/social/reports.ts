// Reporting and blocking for user-generated content (FEAR-119): player
// profiles, chat messages and Storyteller rating comments. Reports land in
// `player_reports` for the admin moderation queue (FEAR-31). Reporters never
// learn the reported player's account; Storytellers never learn who rated them.
import { database } from '@/db';
import { requireThat } from '@/lib/game/engine';
import { hash } from '@/lib/game/store';
import type { Game } from '@/lib/game/types';
import { accountByHandle, blockAccount } from './friends';

export const REPORT_REASONS = [
  'harassment',
  'hate',
  'sexual',
  'spam',
  'cheating',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

function reasonOf(value: unknown): ReportReason {
  requireThat(
    REPORT_REASONS.includes(value as ReportReason),
    'Choose a reason for the report.',
  );
  return value as ReportReason;
}
function noteOf(value: unknown) {
  const note = typeof value === 'string' ? value.trim() : '';
  requireThat(note.length <= 500, 'Keep the note under 500 characters.');
  return note;
}

type Report = {
  kind: 'player' | 'chat' | 'rating';
  reason: unknown;
  note: unknown;
  reporterAccount?: string | null;
  reporterSeat?: string | null;
  targetAccount?: string | null;
  targetName?: string;
  code?: string | null;
  game?: string | null;
  messageId?: string | null;
  content?: string;
};

async function insertReport(report: Report, now: number) {
  const id = crypto.randomUUID();
  await database()
    .prepare(
      'INSERT INTO player_reports (id,kind,reason,note,reporter_account,reporter_seat,target_account,target_name,code,game,message_id,content,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      id,
      report.kind,
      reasonOf(report.reason),
      noteOf(report.note),
      report.reporterAccount ?? null,
      report.reporterSeat ?? null,
      report.targetAccount ?? null,
      (report.targetName ?? '').slice(0, 64),
      report.code ?? null,
      report.game ?? null,
      report.messageId ?? null,
      (report.content ?? '').slice(0, 2000),
      now,
    )
    .run();
  return { id };
}

// The account behind a seat at a table, if the seat is linked to one.
async function seatAccount(code: string, player: string) {
  const row = await database()
    .prepare('SELECT account FROM account_seats WHERE id = ?')
    .bind(`${code}:${player}`)
    .first<{ account: string }>();
  return row?.account ?? null;
}

export async function reportPlayer(
  me: string,
  handleValue: unknown,
  reason: unknown,
  note: unknown,
  now: number,
) {
  requireThat(
    typeof handleValue === 'string' && handleValue.length < 40,
    'Player not found.',
  );
  const target = await accountByHandle(handleValue.trim().toLowerCase());
  requireThat(target, 'Player not found.');
  requireThat(target.id !== me, 'You cannot report yourself.');
  return insertReport(
    {
      kind: 'player',
      reason,
      note,
      reporterAccount: me,
      targetAccount: target.id,
      targetName: target.handle ?? '',
      content: target.handle ?? '',
    },
    now,
  );
}

// Messages a viewer can see, mirroring lib/game/view.ts.
function visibleTo(g: Game, viewer: { id: string; host: boolean }) {
  return g.messages.filter((m) =>
    viewer.host
      ? true
      : m.to.startsWith('channel:')
        ? [g.hms?.channel?.a, g.hms?.channel?.b].includes(viewer.id)
        : m.to === 'all' || m.to === viewer.id || m.from === viewer.id,
  );
}

export async function reportChat(
  g: Game,
  actor: { id: string; host: boolean },
  reporterAccount: string | null,
  messageId: unknown,
  reason: unknown,
  note: unknown,
  now: number,
) {
  const message = visibleTo(g, actor).find((m) => m.id === messageId);
  requireThat(message, 'That message is no longer available.');
  requireThat(message.from !== actor.id, 'You cannot report your own message.');
  requireThat(message.kind === 'chat', 'Only chat messages can be reported.');
  const senderName =
    message.from === 'host'
      ? `${g.hostName} (Storyteller)`
      : (g.players.find((p) => p.id === message.from)?.name ?? '');
  return insertReport(
    {
      kind: 'chat',
      reason,
      note,
      reporterAccount,
      reporterSeat: `${g.code}:${actor.id}`,
      targetAccount: await seatAccount(g.code, message.from),
      targetName: senderName,
      code: g.code,
      messageId: message.id,
      content: message.text,
    },
    now,
  );
}

// A stable, opaque reference to one rating, so a Storyteller can report a
// comment without learning who wrote it.
export async function ratingRef(game: string, rater: string) {
  return (await hash(`rating:${game}:${rater}`)).slice(0, 24);
}

export async function reportRating(
  me: string,
  refValue: unknown,
  reason: unknown,
  note: unknown,
  now: number,
) {
  requireThat(
    typeof refValue === 'string' && /^[0-9a-f]{24}$/.test(refValue),
    'That comment is no longer available.',
  );
  const rows = (
    await database()
      .prepare(
        "SELECT game, rater, comment FROM storyteller_ratings WHERE storyteller = ? AND comment <> ''",
      )
      .bind(me)
      .all<{ game: string; rater: string; comment: string }>()
  ).results;
  let match: (typeof rows)[number] | undefined;
  for (const row of rows)
    if ((await ratingRef(row.game, row.rater)) === refValue) match = row;
  requireThat(match, 'That comment is no longer available.');
  return insertReport(
    {
      kind: 'rating',
      reason,
      note,
      reporterAccount: me,
      targetAccount: match.rater,
      game: match.game,
      content: match.comment,
    },
    now,
  );
}

// Block the account behind a seat at a table both players share.
export async function blockSeat(
  me: string,
  codeValue: unknown,
  playerValue: unknown,
  now: number,
) {
  requireThat(
    typeof codeValue === 'string' &&
      typeof playerValue === 'string' &&
      codeValue.length < 20 &&
      playerValue.length < 100,
    'Player not found.',
  );
  const mine = await database()
    .prepare('SELECT 1 FROM account_seats WHERE account = ? AND code = ?')
    .bind(me, codeValue)
    .first();
  requireThat(mine, 'You can only block players at your own table.');
  const other = await seatAccount(codeValue, playerValue);
  requireThat(
    other,
    'This player is a guest without an account, so they can’t be blocked. You can still report their messages.',
  );
  requireThat(other !== me, 'You cannot block yourself.');
  await blockAccount(me, other, now);
}

// Seats at this table whose chat the viewer should not see: players whose
// accounts the viewer's account has blocked.
export async function hiddenChatSenders(code: string, viewer: string) {
  const rows = (
    await database()
      .prepare(
        "SELECT b.player FROM account_seats me JOIN friendships f ON f.requester = me.account AND f.status = 'blocked' JOIN account_seats b ON b.account = f.addressee AND b.code = me.code WHERE me.id = ?",
      )
      .bind(`${code}:${viewer}`)
      .all<{ player: string }>()
  ).results;
  return rows.map((row) => row.player);
}

// Remove chat from blocked senders from a view. Storyteller information and
// corrections are never hidden: the game needs them.
export async function withoutBlockedChat<
  V extends { messages: { from: string; kind: string }[]; me?: string | null },
>(view: V, code: string, viewer: string): Promise<V> {
  if (!view.messages.some((m) => m.kind === 'chat' && m.from !== viewer))
    return view;
  const hidden = await hiddenChatSenders(code, viewer);
  if (!hidden.length) return view;
  return {
    ...view,
    messages: view.messages.filter(
      (m) => !(m.kind === 'chat' && hidden.includes(m.from)),
    ),
  };
}
