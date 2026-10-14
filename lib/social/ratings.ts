import { database } from '@/db';
import { requireThat } from '@/lib/game/engine';
import { validStars, text, ratingBlock, RATING_WINDOW } from './derive';
import { linkSeatRecords } from './results';
import { isObjectionable, OBJECTIONABLE_COMMENT } from './moderation';
import { ratingRef } from './reports';

// Ratings stay open for two weeks after a game ends, and can be revised
// within that window. The Storyteller must hold a linked account (otherwise
// there is nobody to credit) and the rater must have played at that table.
export const ratingWindow = RATING_WINDOW;

type GameRow = {
  id: string;
  code: string;
  host_account: string | null;
  host_name: string;
  ended: number;
};

// Everything a player needs to decide whether they can rate this table.
export async function ratingContext(me: string, code: string, now: number) {
  const db = database();
  await linkSeatRecords(me);
  const game = await db
    .prepare(
      "SELECT g.id,g.code,g.host_account,g.host_name,g.ended FROM games g JOIN sessions s ON s.code=g.code AND (g.id=g.code || ':' || COALESCE(json_extract(s.state,'$.gameStartedAt'),s.created) OR EXISTS (SELECT 1 FROM json_each(s.state,'$.recaps') r WHERE json_extract(r.value,'$.id')=g.id) OR EXISTS (SELECT 1 FROM session_parts p,json_each(p.state) r WHERE p.code=s.code AND p.part LIKE 'recaps:%' AND json_extract(r.value,'$.id')=g.id)) WHERE g.code=? ORDER BY g.ended DESC LIMIT 1",
    )
    .bind(code)
    .first<GameRow>();
  if (!game) return { game: null, canRate: false, reason: 'Not recorded.' };
  return ratingFor(me, game, now);
}

// Rating context for one recorded game, used by every recap screen.
// Returns null unless the viewer played in or told this game.
export async function ratingForGame(me: string, id: string, now: number) {
  await linkSeatRecords(me);
  const game = await database()
    .prepare(
      'SELECT id,code,host_account,host_name,ended FROM games WHERE id=?',
    )
    .bind(id)
    .first<GameRow>();
  if (!game) return null;
  const context = await ratingFor(me, game, now);
  return context.played || game.host_account === me ? context : null;
}

async function ratingFor(me: string, game: GameRow, now: number) {
  const db = database();
  const storyteller = game.host_account
    ? await db
        .prepare('SELECT id,name,handle FROM accounts WHERE id=?')
        .bind(game.host_account)
        .first<{ id: string; name: string; handle: string | null }>()
    : null;
  const played = !!(await db
    .prepare('SELECT 1 AS present FROM game_players WHERE game=? AND account=?')
    .bind(game.id, me)
    .first());
  const mine = await db
    .prepare(
      'SELECT stars,comment,created FROM storyteller_ratings WHERE game=? AND rater=?',
    )
    .bind(game.id, me)
    .first<{ stars: number; comment: string; created: number }>();
  const reason = ratingBlock({
    me,
    storyteller: storyteller?.id ?? null,
    played,
    ended: game.ended,
    now,
  });
  return {
    game: game.id,
    storyteller: storyteller
      ? { name: storyteller.name, handle: storyteller.handle }
      : null,
    hostName: game.host_name,
    host: game.host_account === me,
    played,
    canRate: !reason,
    reason,
    mine,
  };
}

export async function rateStoryteller(
  me: string,
  gameValue: unknown,
  starsValue: unknown,
  commentValue: unknown,
  now: number,
) {
  requireThat(
    typeof gameValue === 'string' && gameValue.length < 100,
    'Choose a game.',
  );
  const stars = validStars(starsValue);
  const comment = text(commentValue, 1000);
  requireThat(!isObjectionable(comment), OBJECTIONABLE_COMMENT);
  const db = database();
  await linkSeatRecords(me);
  const game = await db
    .prepare(
      'SELECT id,code,host_account,host_name,ended FROM games WHERE id=?',
    )
    .bind(gameValue)
    .first<GameRow>();
  requireThat(game, 'That game was not recorded.');
  requireThat(
    game.host_account,
    'This Storyteller has not linked an account, so the rating cannot be credited.',
  );
  requireThat(game.host_account !== me, 'You cannot rate yourself.');
  requireThat(
    now - game.ended < ratingWindow,
    'The rating window for this game has closed.',
  );
  const played = await db
    .prepare('SELECT 1 AS present FROM game_players WHERE game=? AND account=?')
    .bind(game.id, me)
    .first();
  requireThat(
    played,
    'Only players seated at this table can rate the Storyteller.',
  );
  await db
    .prepare(
      'INSERT INTO storyteller_ratings (game,rater,storyteller,stars,comment,created) VALUES (?,?,?,?,?,?) ON CONFLICT(game,rater) DO UPDATE SET stars=excluded.stars,comment=excluded.comment,created=excluded.created',
    )
    .bind(game.id, me, game.host_account, stars, comment, now)
    .run();
  return { stars, comment };
}

// The Storyteller's own feedback, with comments. Raters are not identified.
export async function receivedRatings(storyteller: string) {
  const rows = await database()
    .prepare(
      'SELECT r.game,r.rater,r.stars,r.comment,r.created,g.code,g.ended,g.players FROM storyteller_ratings r JOIN games g ON g.id=r.game WHERE r.storyteller=? ORDER BY r.created DESC LIMIT 50',
    )
    .bind(storyteller)
    .all<{
      game: string;
      rater: string;
      stars: number;
      comment: string;
      created: number;
      code: string;
      ended: number;
      players: number;
    }>();
  // Raters stay anonymous: `ref` lets the Storyteller report a comment.
  return Promise.all(
    rows.results.map(async ({ game, rater, ...rating }) => ({
      ...rating,
      ref: rating.comment ? await ratingRef(game, rater) : null,
    })),
  );
}
