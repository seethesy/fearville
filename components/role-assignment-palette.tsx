'use client';
import { role, scriptRoles, TEAM_NAMES, TEAM_ORDER } from '@/lib/game/types';
import type { GameView } from '@/lib/game/view';
import { RoleIcon } from './role-icon';

export function RoleAssignmentPalette({
  game,
  selected,
  onSelect,
}: {
  game: GameView;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const roles = scriptRoles(game.script);
  return (
    <aside className="panel role-assignment-palette" aria-label="Drag characters to seats">
      <h3>Character tray</h3>
      <p className="muted">Drag a character onto a seat, or tap one and choose a seat. Assignments stay private until the game starts.</p>
      {TEAM_ORDER.filter((team) => roles.some((r) => r.team === team)).map((team) => (
        <div key={team} className="role-assignment-team">
          <h4>{TEAM_NAMES[team]}</h4>
          {roles.filter((r) => r.team === team).map((r) => {
            const holder = game.players.find((p) => p.role === r.id);
            return (
              <button
                type="button"
                key={r.id}
                draggable
                className="role-assignment-chip"
                aria-pressed={selected === r.id}
                title={holder ? `${r.name} · ${holder.name}` : r.description}
                onClick={() => onSelect(r.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', r.id);
                  event.dataTransfer.effectAllowed = 'move';
                  onSelect(r.id);
                }}
              >
                <RoleIcon role={r.id} />
                <span>{role(r.id)?.name}</span>
                {holder && <small>{holder.name}</small>}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
