'use client';
import AppLink from '@/components/app-link';
import { useCallback, useEffect, useState } from 'react';
import { social, load } from './api';

const RATED = 'fearville:storyteller-rated';
type Rating = {
  game: string;
  storyteller: { name: string; handle: string | null } | null;
  hostName: string;
  host: boolean;
  played: boolean;
  canRate: boolean;
  reason: string;
  mine: { stars: number; comment: string; created: number } | null;
};

// FEAR-160: rate the Storyteller (1–5 stars, optional comment) as the first
// block of every recap: the end-of-game popup, the Session Recap tab and the
// account history. Every screen reads and writes the same rating row, so a
// revision anywhere shows everywhere and nothing is counted twice.
// `explain` shows short explanations to ineligible viewers (the popup);
// recap lists stay quiet instead.
export function RecapRating({
  game,
  explain = false,
}: {
  game: string;
  explain?: boolean;
}) {
  const [rating, setRating] = useState<Rating | null>(null),
    [account, setAccount] = useState<string | null | undefined>(undefined),
    [stars, setStars] = useState(0),
    [comment, setComment] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await load<{
        account: string | null;
        rating: Rating | null;
      }>('/api/social/rating?game=' + encodeURIComponent(game));
      setAccount(data.account);
      setRating(data.rating);
      if (data.rating?.mine) {
        setStars(data.rating.mine.stars);
        setComment(data.rating.mine.comment);
        setSaved(true);
      }
      return !!data.rating || !data.account;
    } catch {
      return false;
    }
  }, [game]);
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    // The game record is written as the game ends; look once more shortly after.
    const id = setTimeout(
      () =>
        void refresh().then((found) => {
          if (!found) retry = setTimeout(() => void refresh(), 3000);
        }),
      0,
    );
    // Another recap on the page saved a rating for this game: reload it.
    const changed = (e: Event) => {
      if ((e as CustomEvent<string>).detail === game) void refresh();
    };
    window.addEventListener(RATED, changed);
    return () => {
      clearTimeout(id);
      clearTimeout(retry);
      window.removeEventListener(RATED, changed);
    };
  }, [refresh, game]);
  async function submit() {
    if (!rating) return;
    setBusy(true);
    setError('');
    try {
      await social({ action: 'rate', game: rating.game, stars, comment });
      setSaved(true);
      window.dispatchEvent(new CustomEvent(RATED, { detail: game }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rating failed.');
    } finally {
      setBusy(false);
    }
  }
  if (account === null)
    return explain ? (
      <div className="social-inline recap-rating">
        <p className="eyebrow">RATE YOUR STORYTELLER</p>
        <p className="muted">
          <AppLink href="/account">Sign in</AppLink> and save this seat to rate
          the Storyteller and keep this game in your record.
        </p>
      </div>
    ) : null;
  if (!rating) return null;
  if (rating.host)
    return explain ? (
      <div className="social-inline recap-rating">
        <p className="eyebrow">YOUR RATING</p>
        <p className="muted">
          Players can rate your storytelling for two weeks. Ratings and comments
          appear on your <AppLink href="/stats">record</AppLink>.
        </p>
      </div>
    ) : null;
  if (!rating.canRate)
    return explain || rating.mine ? (
      <div className="social-inline recap-rating">
        <p className="eyebrow">RATE YOUR STORYTELLER</p>
        {rating.mine && (
          <p className="muted">
            You rated this game {rating.mine.stars} of 5 stars.
          </p>
        )}
        <p className="muted">{rating.reason}</p>
      </div>
    ) : null;
  return (
    <div className="social-inline recap-rating">
      <p className="eyebrow">RATE YOUR STORYTELLER</p>
      <p className="muted">
        How was {rating.storyteller?.name || rating.hostName}&rsquo;s
        storytelling? Only the Storyteller sees your comment; the average is
        public to their friends.
      </p>
      <fieldset className="star-row">
        <legend className="sr-only">Storyteller rating</legend>
        {[5, 4, 3, 2, 1].map((n) => (
          <label
            key={n}
            className={'star' + (stars >= n ? ' lit' : '')}
            title={n + (n === 1 ? ' star' : ' stars')}
          >
            <input
              type="radio"
              name={'stars-' + game}
              value={n}
              className="sr-only"
              checked={stars === n}
              onChange={() => {
                setStars(n);
                setSaved(false);
              }}
            />
            ★
          </label>
        ))}
      </fieldset>
      {stars > 0 && (
        <>
          <label className="field">
            Comment (optional)
            <textarea
              rows={2}
              maxLength={1000}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setSaved(false);
              }}
              placeholder="What worked well? What would help next time?"
            />
          </label>
          <div className="actions">
            <button
              className="primary"
              disabled={busy || saved}
              onClick={() => void submit()}
            >
              {saved
                ? 'Rating saved'
                : busy
                  ? 'Saving…'
                  : rating.mine
                    ? 'Update rating'
                    : 'Submit rating'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
