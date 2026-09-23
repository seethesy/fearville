'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { social, load, type TableSocial } from './api';

// End-of-game panel for players: rate the Storyteller from 1 to 5 stars.
export function RateStoryteller({
  code,
  host,
}: {
  code: string;
  host: boolean;
}) {
  const [state, setState] = useState<TableSocial | null>(null),
    [stars, setStars] = useState(0),
    [comment, setComment] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const data = await load<TableSocial>('/api/social/table?code=' + code);
      setState(data);
      if (data.rating?.mine) {
        setStars(data.rating.mine.stars);
        setComment(data.rating.mine.comment);
        setSaved(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.');
    }
  }, [code]);
  useEffect(() => {
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);
  async function submit() {
    if (!state?.rating.game) return;
    setBusy(true);
    setError('');
    try {
      await social({
        action: 'rate',
        game: state.rating.game,
        stars,
        comment,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rating failed.');
    } finally {
      setBusy(false);
    }
  }
  if (host)
    return (
      <div className="social-inline">
        <p className="eyebrow">YOUR RATING</p>
        <p className="muted">
          Players can now rate your storytelling. Ratings and comments appear on
          your <Link href="/stats">record</Link>.
        </p>
      </div>
    );
  if (!state) return null;
  if (!state.account)
    return (
      <div className="social-inline">
        <p className="eyebrow">RATE YOUR STORYTELLER</p>
        <p className="muted">
          <Link href="/account">Sign in</Link> and save this seat to rate the
          Storyteller and keep this game in your record.
        </p>
      </div>
    );
  const r = state.rating;
  if (!r.game) return null;
  return (
    <div className="social-inline">
      <p className="eyebrow">RATE YOUR STORYTELLER</p>
      {r.canRate ? (
        <>
          <p className="muted">
            How was {r.storyteller?.name || r.hostName}&rsquo;s storytelling?
            Only the Storyteller sees your comment; the average is public to
            their friends.
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
                  name="stars"
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
              disabled={busy || stars === 0 || saved}
              onClick={() => void submit()}
            >
              {saved ? 'Rating saved' : busy ? 'Saving…' : 'Submit rating'}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">{r.reason}</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
