'use client';
import { useState } from 'react';
import { load, when } from './api';
import { SCRIPTS } from '@/lib/game/types';
import { HistoryRecap } from '@/components/hub/history-recap';
import type { Stats, RecentGame, Breakdown } from '@/lib/social/stats';
export type { Stats, RecentGame } from '@/lib/social/stats';
const names: Record<string, string> = {
  townsfolk: 'Villagers',
  outsider: 'Fools',
  minion: 'Haunts',
  demon: 'Horrors',
};
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? '—' : n + '%');
export const stars = (value: number | null) =>
  value === null ? '—' : value.toFixed(1) + ' ★';
function Summary({ value }: { value: Breakdown }) {
  return (
    <p className="breakdown-summary">
      {value.played} played · {value.wins} wins · {value.losses} losses ·{' '}
      {pct(value.winRate)} won
      <br />
      Opponent Elo {value.averageOpponentElo ?? '—'} · Teammate Elo{' '}
      {value.averageTeamElo ?? '—'}
    </p>
  );
}
export function Record({ stats }: { stats: Stats }) {
  const [script, setScript] = useState(''),
    [type, setType] = useState('');
  const selected = stats.scripts.find((s) => s.script === script) ?? stats;
  const types = selected.roleTypes;
  const filtered = types.find((t) => t.type === type);
  const roles = filtered?.roles ?? selected.roles;
  const p = stats.progression;
  return (
    <>
      <div className="progression-card">
        <div>
          <span className="eyebrow">EXPERIENCE</span>
          <h2>Level {p.level}</h2>
          <span>{number(p.xp)} total XP</span>
        </div>
        <div className="level-meter">
          <progress
            max={p.required}
            value={p.earned}
            aria-label={`Level ${p.level} progress`}
          />
          <small>
            {number(p.earned)} / {number(p.required)} XP · {number(p.remaining)}{' '}
            to level {p.level + 1}
          </small>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat-tile">
          <span>Elo</span>
          <strong>{stats.elo}</strong>
          <small>
            {stats.ranked.played} ranked games · Peak {stats.peakElo}
          </small>
        </div>
        <div className="stat-tile">
          <span>Player record</span>
          <strong>
            {stats.wins}–{stats.losses}
          </strong>
          <small>
            {stats.games} games · {pct(stats.winRate)} won
          </small>
        </div>
        <div className="stat-tile">
          <span>As town</span>
          <strong>
            {stats.town.wins}–{stats.town.losses}
          </strong>
        </div>
        <div className="stat-tile">
          <span>As evil</span>
          <strong>
            {stats.evil.wins}–{stats.evil.losses}
          </strong>
        </div>
        <div className="stat-tile">
          <span>Ranked record</span>
          <strong>
            {stats.ranked.wins}–{stats.ranked.losses}
          </strong>
          <small>{pct(stats.ranked.winRate)} won</small>
        </div>
        <div className="stat-tile">
          <span>Storyteller</span>
          <strong>{stats.storyteller.games}</strong>
          <small>
            {stars(stats.storyteller.rating)} · {stats.storyteller.ratings}{' '}
            ratings
          </small>
        </div>
        <div className="stat-tile">
          <span>Average lobby Elo</span>
          <strong>{stats.averageOpponentElo ?? '—'}</strong>
          <small>Opponents · Teammates {stats.averageTeamElo ?? '—'}</small>
        </div>
        <div className="stat-tile">
          <span>MVP votes</span>
          <strong>{stats.mvpVotes}</strong>
          <small>{number(stats.mvpXp)} bonus XP</small>
        </div>
        <div className="stat-tile">
          <span>Win streak</span>
          <strong>{stats.currentWinStreak}</strong>
          <small>Best {stats.bestWinStreak}</small>
        </div>
        <div className="stat-tile">
          <span>Survival rate</span>
          <strong>{pct(stats.survivalRate)}</strong>
          <small>Average game {stats.averageDurationMinutes ?? '—'} min</small>
        </div>
      </div>
      <p className="eyebrow section-gap">EXPLORE YOUR RECORD</p>
      <div className="record-filters">
        <label className="field">
          Script
          <select
            value={script}
            onChange={(e) => {
              setScript(e.target.value);
              setType('');
            }}
          >
            <option value="">All scripts</option>
            {stats.scripts.map((s) => (
              <option key={s.script} value={s.script}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Role type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All role types</option>
            {types.map((t) => (
              <option key={t.type} value={t.type}>
                {names[t.type] ?? t.type}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Summary value={filtered ?? selected} />
      {!type && (
        <div className="type-breakdowns">
          {types.map((t) => (
            <div key={t.type}>
              <strong>{names[t.type] ?? t.type}</strong>
              <Summary value={t} />
            </div>
          ))}
        </div>
      )}
      {roles.length === 0 ? (
        <p className="muted">No finished games yet.</p>
      ) : (
        <div className="statistics-table-wrap">
          <table className="statistics-table">
            <caption>
              Character statistics
              {script ? ` · ${'name' in selected ? selected.name : ''}` : ''}
            </caption>
            <thead>
              <tr>
                <th>Character</th>
                <th>Played</th>
                <th>W–L</th>
                <th>Win rate</th>
                <th>Opp. Elo</th>
                <th>Team Elo</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.role + r.team}>
                  <th scope="row">
                    {r.name}
                    <small className={'alignment-tag ' + r.team}>
                      {names[r.roleType] ?? r.team}
                    </small>
                  </th>
                  <td>{r.played}</td>
                  <td>
                    {r.wins}–{r.losses}
                  </td>
                  <td>{pct(r.winRate)}</td>
                  <td>{r.averageOpponentElo ?? '—'}</td>
                  <td>{r.averageTeamElo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function RecentGames({
  games,
  handle,
}: {
  games: RecentGame[];
  handle?: string;
}) {
  return (
    <History
      key={
        (handle ?? 'self') +
        games.map((g) => `${g.id}:${g.xp}:${g.eloDelta}`).join('|')
      }
      games={games}
      handle={handle}
    />
  );
}
function History({ games, handle }: { games: RecentGame[]; handle?: string }) {
  const [rows, setRows] = useState(games),
    [next, setNext] = useState<number | null>(games.length === 20 ? 20 : null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function more() {
    setBusy(true);
    setError('');
    try {
      const page = await load<{
        games: RecentGame[];
        nextOffset: number | null;
      }>(
        `/api/social/history?offset=${next}${handle ? '&handle=' + encodeURIComponent(handle) : ''}`,
      );
      setRows((existing) => [
        ...existing,
        ...page.games.filter((g) => !existing.some((r) => r.id === g.id)),
      ]);
      setNext(page.nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    } finally {
      setBusy(false);
    }
  }
  if (!rows.length)
    return <p className="muted">Finished games will be listed here.</p>;
  return (
    <>
      <div className="friend-rows">
        {rows.map((g) => (
          <div key={g.id} className="friend-row match-row">
            <div>
              <strong>
                {g.storyteller ? 'Storyteller' : (g.roleName ?? 'Player')} ·{' '}
                {g.winner === 'good' ? 'Good' : 'Evil'} won
              </strong>
              <small>
                {when(g.ended)} ·{' '}
                {SCRIPTS[g.script as keyof typeof SCRIPTS] ?? 'Legacy script'} ·{' '}
                {g.ranked ? 'Ranked' : 'Casual'} · {g.players} players
              </small>
              <small>
                {g.storyteller ? 'Your table' : g.hostName + '’s table'} ·{' '}
                {g.code} ·{' '}
                {Math.max(0, Math.round((g.ended - g.started) / 60000))} min
              </small>
              <small>
                {number(g.xp)} XP
                {g.mvpVotes ? ` · ${g.mvpVotes} MVP votes` : ''}
                {g.ranked && !g.storyteller
                  ? ` · Elo ${g.eloDelta >= 0 ? '+' : ''}${g.eloDelta} (started at ${g.ratingBefore})`
                  : ''}
              </small>
              {!g.storyteller && (
                <small>
                  Opponent Elo{' '}
                  {g.averageOpponentElo == null
                    ? '—'
                    : Math.round(g.averageOpponentElo)}{' '}
                  · Teammate Elo{' '}
                  {g.averageTeamElo == null
                    ? '—'
                    : Math.round(g.averageTeamElo)}
                </small>
              )}
            </div>
            {!handle && <HistoryRecap id={g.id} />}
            <span
              className={
                'status-pill ' + (g.storyteller ? '' : g.won ? 'win' : 'loss')
              }
            >
              {g.storyteller ? g.reason : g.won ? 'Won' : 'Lost'}
            </span>
          </div>
        ))}
      </div>
      {next !== null && (
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => void more()}
        >
          {busy ? 'Loading…' : 'Load older games'}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
