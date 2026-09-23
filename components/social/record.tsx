'use client';
import { when } from './api';

export type Stats = {
  games: number;
  town: { wins: number; losses: number };
  evil: { wins: number; losses: number };
  roles: {
    role: string;
    name: string;
    team: string;
    played: number;
    wins: number;
    losses: number;
  }[];
  storyteller: { games: number; rating: number | null; ratings: number };
};
export type RecentGame = {
  id: string;
  code: string;
  hostName: string;
  ended: number;
  players: number;
  winner: string;
  reason: string;
  roleName: string | null;
  team: string | null;
  won: number | null;
  storyteller: boolean;
};

const pct = (wins: number, losses: number) =>
  wins + losses ? Math.round((wins / (wins + losses)) * 100) + '%' : '—';
export const stars = (value: number | null) =>
  value === null ? '—' : value.toFixed(1) + ' ★';

// Shared read-only rendering of a player's record.
export function Record({ stats }: { stats: Stats }) {
  return (
    <>
      <div className="stat-grid">
        <div className="stat-tile">
          <span>Games as player</span>
          <strong>{stats.games}</strong>
        </div>
        <div className="stat-tile">
          <span>As town</span>
          <strong>
            {stats.town.wins}–{stats.town.losses}
          </strong>
          <small>{pct(stats.town.wins, stats.town.losses)} won</small>
        </div>
        <div className="stat-tile">
          <span>As evil</span>
          <strong>
            {stats.evil.wins}–{stats.evil.losses}
          </strong>
          <small>{pct(stats.evil.wins, stats.evil.losses)} won</small>
        </div>
        <div className="stat-tile">
          <span>Storyteller</span>
          <strong>{stats.storyteller.games}</strong>
          <small>
            {stats.storyteller.games === 1 ? 'game' : 'games'} ·{' '}
            {stars(stats.storyteller.rating)}
            {stats.storyteller.ratings ? ` (${stats.storyteller.ratings})` : ''}
          </small>
        </div>
      </div>
      <p className="eyebrow section-gap">CHARACTERS PLAYED</p>
      {stats.roles.length === 0 ? (
        <p className="muted">No finished games yet.</p>
      ) : (
        <div className="role-table">
          <div className="role-table-head">
            <span>Character</span>
            <span>Played</span>
            <span>W–L</span>
            <span>Win rate</span>
          </div>
          {stats.roles.map((r) => (
            <div key={r.role + r.team} className="role-table-row">
              <span>
                {r.name}
                <small className={'alignment-tag ' + r.team}>{r.team}</small>
              </span>
              <span>{r.played}</span>
              <span>
                {r.wins}–{r.losses}
              </span>
              <span>{pct(r.wins, r.losses)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function RecentGames({ games }: { games: RecentGame[] }) {
  if (games.length === 0)
    return <p className="muted">Finished games will be listed here.</p>;
  return (
    <div className="friend-rows">
      {games.map((g) => (
        <div key={g.id} className="friend-row">
          <div>
            <strong>
              {g.storyteller ? 'Storyteller' : g.roleName || 'Player'}
              {' · '}
              {g.winner === 'good' ? 'Good' : 'Evil'} won
            </strong>
            <small>
              {when(g.ended)} · {g.players} players ·{' '}
              {g.storyteller ? 'your table' : g.hostName + '’s table'} ·{' '}
              {g.code}
            </small>
          </div>
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
  );
}
