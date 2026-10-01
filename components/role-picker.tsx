'use client';
import { useState } from 'react';
import { ROLES, COUNTS } from '@/lib/game/types';
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
  const counts = COUNTS[game.players.length];
  const extra = selected.includes('baron') ? 2 : 0;
  const expected = counts
    ? [counts[0] - extra, counts[1] + extra, counts[2], counts[3]]
    : null;
  const teams = ['townsfolk', 'outsider', 'minion', 'demon'];
  const valid =
    expected &&
    selected.length === game.players.length &&
    teams.every(
      (team, i) =>
        selected.filter((id) => ROLES.find((r) => r.id === id)?.team === team)
          .length === expected[i],
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
        {extra > 0
          ? ' · Baron: two Villagers become Fools (private setup)'
          : ''}
      </p>
      {!counts && <p>Join 5–15 players to deal a balanced setup.</p>}
      {teams.map((team, i) => (
        <section key={team}>
          <h3>
            {team === 'townsfolk'
              ? 'Villagers'
              : team === 'outsider'
                ? 'Fools'
                : team === 'minion'
                  ? 'Haunts'
                  : 'Horrors'}{' '}
            ·{' '}
            {
              selected.filter(
                (id) => ROLES.find((r) => r.id === id)?.team === team,
              ).length
            }
            {expected ? ` / ${expected[i]}` : ''}
          </h3>
          <div className="role-pick-grid">
            {ROLES.filter((r) => r.team === team).map((r) => (
              <button
                key={r.id}
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
                <small>{r.description}</small>
              </button>
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
