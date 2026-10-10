import { database } from '@/db';
import { isTutorialId } from './content.ts';
import type { SeenItem } from './types.ts';

// Server-side tutorial progress for signed-in accounts (FEAR-16). Guests are
// never stored here. Input is validated by parseItems (validate.ts).

export async function seenFor(account: string): Promise<SeenItem[]> {
  const rows = await database()
    .prepare(
      'SELECT tutorial AS id, status FROM tutorial_progress WHERE account=? ORDER BY tutorial',
    )
    .bind(account)
    .all<SeenItem>();
  return rows.results.filter((r) => isTutorialId(r.id));
}

export async function markSeen(
  account: string,
  items: SeenItem[],
  now: number,
) {
  if (!items.length) return;
  const db = database();
  await db.batch(
    items.map((item) =>
      db
        .prepare(
          // A completion is never downgraded to skipped.
          "INSERT INTO tutorial_progress (account,tutorial,status,updated) VALUES (?,?,?,?) ON CONFLICT(account,tutorial) DO UPDATE SET status=CASE WHEN tutorial_progress.status='completed' THEN 'completed' ELSE excluded.status END, updated=excluded.updated",
        )
        .bind(account, item.id, item.status, now),
    ),
  );
}

export async function resetSeen(account: string) {
  await database()
    .prepare('DELETE FROM tutorial_progress WHERE account=?')
    .bind(account)
    .run();
}
