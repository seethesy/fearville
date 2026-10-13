import { database } from '@/db';
import { read } from '@/lib/game/store';
import { removeMember } from '@/lib/game/membership';
import { log } from '@/lib/game/engine';
import type { Game } from '@/lib/game/types';
import { prepareWrite } from '@/lib/game/part-store';
export const assertSQL = (
  condition: string,
  ...values: (string | number | null)[]
) =>
  database()
    .prepare(
      `INSERT INTO admin_assertions(ok) SELECT CASE WHEN ${condition} THEN 1 ELSE 0 END`,
    )
    .bind(...values);
export function cancelGame(g: Game, now: number) {
  g.phase = 'ended';
  g.winner = 'Canceled by administration';
  g.gameEndedAt = now;
  g.deadline = null;
  g.remaining = 0;
  g.active = null;
  g.history = [];
  g.nightChoices = {};
  g.nightChoiceTasks = [];
  g.nightChoiceDeadlines = {};
  delete g.nightChoiceDeadline;
  g.nightIntroductions = {};
  g.deferredNightTasks = [];
  if (g.rite)
    g.rite = {
      config: g.rite.config,
      seed: crypto.randomUUID(),
      epoch: crypto.randomUUID(),
      status: 'complete',
      plans: [],
      squads: [],
      resolvedNight: g.night,
      completedNight: g.night,
    };
  for (const p of g.players) p.publicAlive = p.alive;
  log(
    g,
    'Administration ended this game. No result or rewards will be recorded.',
    now,
    true,
  );
}
export function removeFromGame(g: Game, player: string, now: number) {
  if (g.players.some((p) => p.id === player && !p.departed))
    removeMember(g, { id: 'host', host: true }, player, now);
  if (g.active) {
    delete g.active.votes[player];
  }
  delete g.nightChoices?.[player];
  delete g.nightChoiceDeadlines?.[player];
  delete g.nightIntroductions?.[player];
  g.nightChoiceTasks = g.nightChoiceTasks?.filter((t) => t.player !== player);
  // A membership change invalidates all puzzle actions for the current window.
  // Keep next-night configuration, cancel this window, and rotate its epoch.
  if (g.rite)
    g.rite = {
      config: g.rite.config,
      seed: crypto.randomUUID(),
      epoch: crypto.randomUUID(),
      status: 'complete',
      plans: [],
      squads: [],
      resolvedNight: g.night,
      completedNight: g.night,
    };
  g.history = [];
  log(
    g,
    'Administration updated table membership. Any current Night Rite window was closed.',
    now,
    true,
  );
}
export function gameStatements(game: Game, version: number) {
  const db = database();
  const write = prepareWrite(db, game, version);
  return [
    assertSQL(
      'EXISTS (SELECT 1 FROM sessions WHERE code=? AND version=?)',
      game.code,
      version,
    ),
    write.update,
    ...write.after,
    db.prepare('DELETE FROM session_snapshots WHERE code=?').bind(game.code),
    ...(game.phase === 'ended'
      ? [db.prepare('DELETE FROM ranked_seats WHERE code=?').bind(game.code)]
      : []),
  ];
}
export async function removalPlan(account: string, code?: string) {
  const db = database();
  const rows = await db
    .prepare(
      'SELECT code,player,host FROM account_seats WHERE account=?' +
        (code ? ' AND code=?' : ''),
    )
    .bind(...(code ? [account, code] : [account]))
    .all<{ code: string; player: string; host: number }>();
  const statements: D1PreparedStatement[] = [];
  const changed: string[] = [];
  for (const code of new Set(rows.results.map((r) => r.code))) {
    const { game, version } = await read(code);
    for (const seat of rows.results.filter((r) => r.code === code)) {
      if (seat.host) {
        cancelGame(game, Date.now());
        game.hostName = 'Storyteller unavailable';
      } else removeFromGame(game, seat.player, Date.now());
      statements.push(
        db
          .prepare('DELETE FROM members WHERE code=? AND player=?')
          .bind(code, seat.player),
      );
    }
    statements.push(...gameStatements(game, version));
    statements.push(
      db
        .prepare('DELETE FROM account_seats WHERE account=? AND code=?')
        .bind(account, code),
    );
    changed.push(code);
  }
  return { statements, changed };
}
