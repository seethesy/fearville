import { database } from '@/db';

// Counts for badges on the entry and account pages.
export async function pendingCounts(me: string, now: number) {
  const db = database();
  const requests = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM friendships WHERE addressee=? AND status='pending'",
    )
    .bind(me)
    .first<{ n: number }>();
  const invites = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM session_invites i JOIN sessions s ON s.code=i.code WHERE i.recipient=? AND i.status='pending' AND i.expires>? AND json_extract(s.state,'$.phase')='lobby'",
    )
    .bind(me, now)
    .first<{ n: number }>();
  return { requests: requests?.n || 0, invites: invites?.n || 0 };
}
