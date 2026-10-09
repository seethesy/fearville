'use client';
import { GlossaryText } from '@/components/glossary-text';
import { useState } from 'react';
import {
  standardCounts,
  scriptRoles,
  role,
  TEAM_ORDER,
  TEAM_NAMES,
  type Team,
} from '@/lib/game/types';
import type { GameView } from '@/lib/game/view';
import { RoleIcon } from './role-icon';
export function RolePicker({
  game,
  refresh,
}: {
  game: GameView;
  refresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    game.players.map((p) => p.role).filter((r): r is string => !!r),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const counts = standardCounts(game.script, game.players.length);
  const ROLES = scriptRoles(game.script);
  const hms = game.script === 'holyMoonStars';
  const atheist = hms && selected.includes('atheist');
  const extra = hms && selected.includes('moonshiner') ? 1 : 0;
  const expected: Record<Team, number> | null = !counts
    ? null
    : atheist
      ? {
          ...counts,
          townsfolk: game.players.length - counts.outsider,
          minion: 0,
          demon: 0,
        }
      : {
          ...counts,
          townsfolk: counts.townsfolk - extra,
          outsider: counts.outsider + extra,
        };
  const teams = TEAM_ORDER.filter((t) => ROLES.some((r) => r.team === t));
  const valid =
    expected &&
    selected.length === game.players.length &&
    TEAM_ORDER.every(
      (team) =>
        selected.filter((id) => role(id)?.team === team).length ===
        expected[team],
    );
  return (
    <section className="panel role-picker">
      <h2>Choose this game’s characters</h2>
      <p>
        Tap characters to include them, then deal them randomly to players. You
        can still edit individual assignments afterward.
      </p>
      <p>
        <strong>
          {selected.length} / {game.players.length} selected
        </strong>
        {atheist
          ? ' · Atheist: every player is good'
          : extra > 0
            ? ' · Moonshiner: one Villager becomes a Fool, and every Fool is drunk'
            : ''}
      </p>
      {!counts && <p>Join 5–18 players to deal a balanced setup.</p>}
      {teams.map((team) => (
        <section key={team}>
          <h3>
            {TEAM_NAMES[team]} ·{' '}
            {selected.filter((id) => role(id)?.team === team).length}
            {expected ? ` / ${expected[team]}` : ''}
          </h3>
          <div className="role-pick-grid">
            {ROLES.filter((r) => r.team === team).map((r) => (
              <article key={r.id} className="role-pick-card">
                <button
                  className={
                    selected.includes(r.id) ? 'role-pick chosen' : 'role-pick'
                  }
                  aria-pressed={selected.includes(r.id)}
                  disabled={busy}
                  onClick={() =>
                    setSelected((old) =>
                      old.includes(r.id)
                        ? old.filter((id) => id !== r.id)
                        : [...old, r.id],
                    )
                  }
                >
                  <RoleIcon role={r.id} />
                  <strong>{r.name}</strong>
                </button>
                <small>
                  <GlossaryText text={r.description} />
                </small>
              </article>
            ))}
          </div>
        </section>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await fetch('/api/game', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'randomAssign',
                roles: selected,
                version: game.version,
              }),
            });
            const d = (await r.json()) as { error?: string };
            if (!r.ok) throw Error(d.error || 'Could not deal roles.');
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Dealing…' : 'Deal selected characters'}
      </button>
    </section>
  );
}
