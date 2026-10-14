'use client';
import { PlayerNotes } from '@/components/player-notes';
import { RolePicker } from '@/components/role-picker';
import { RoleAssignmentPalette } from '@/components/role-assignment-palette';
import { RoleIcon } from '@/components/role-icon';
import { PlayerAvatar } from '@/components/player-avatar';
import { role, scriptRoles } from '@/lib/game/types';
import { TabsContent } from '@/components/ui/tabs';
import { TableMembership } from '@/components/table-membership';
import { type TableContext } from './display.tsx';
export function TableSeats({
  game,
  refresh,
  button,
  roleError,
  selectedRole,
  setSelectedRole,
  dropSeat,
  setDropSeat,
  assignSeatRole,
  busy,
  socket,
  setChatPlayer,
  setActiveTab,
}: Pick<
  TableContext,
  | 'game'
  | 'refresh'
  | 'button'
  | 'roleError'
  | 'selectedRole'
  | 'setSelectedRole'
  | 'dropSeat'
  | 'setDropSeat'
  | 'assignSeatRole'
  | 'busy'
  | 'socket'
  | 'setChatPlayer'
  | 'setActiveTab'
>) {
  return (
    <TabsContent value="seats" keepMounted>
      {!game.host && (
        <>
          {game.phase !== 'lobby' && (
            <div data-tutorial="notes-panel">
              <PlayerNotes
                key={'notes:' + game.code + game.me + game.gameStartedAt}
                game={game}
              />
            </div>
          )}
        </>
      )}
      {game.host && (
        <>
          {game.phase === 'lobby' && (
            <TableMembership
              key={`host-membership:${game.code}`}
              game={game}
              refresh={refresh}
            />
          )}
          {game.phase === 'lobby' && (
            <section className="panel" data-tutorial="host-setup">
              <h2>{game.scriptName}</h2>
              {game.controls
                .filter((c) => c.action === 'setScript')
                .map((c) => button(c))}
              <h3>Role distribution</h3>
              <p className="muted">
                {game.customRoleDistribution
                  ? 'Custom counts are visible to everyone at the table.'
                  : 'Standard counts are visible to everyone at the table.'}
              </p>
              <div className="actions">
                {game.controls
                  .filter((c) =>
                    ['setRoleDistribution', 'resetRoleDistribution'].includes(
                      c.action,
                    ),
                  )
                  .map((c) => button(c))}
              </div>
            </section>
          )}
          {game.host && game.phase === 'lobby' && (
            <RolePicker
              key={`${game.script}:${game.players.map((p) => p.role).join(',')}`}
              game={game}
              refresh={refresh}
            />
          )}

          {game.host && game.phase === 'lobby' && (
            <section className="panel" data-tutorial="host-assign">
              <h2>Assign the town’s characters.</h2>
              <p className="muted">
                Edit each seat to choose its character manually, or start with a
                random setup and adjust it. Roles are revealed only when you
                begin the game.
              </p>
              <div className="actions">
                {game.controls
                  .filter((c) => c.action === 'randomAssign')
                  .map((c) => button(c, true))}
                {game.controls
                  .filter((c) => c.action === 'configure')
                  .map((c) => button(c))}
              </div>
            </section>
          )}
          {game.phase === 'lobby' && roleError && (
            <p className="error" role="alert">
              {roleError}
            </p>
          )}
          <div
            className={game.phase === 'lobby' ? 'role-assignment-layout' : ''}
          >
            {game.phase === 'lobby' && (
              <RoleAssignmentPalette
                game={game}
                selected={selectedRole}
                onSelect={setSelectedRole}
              />
            )}
            <div className="seat-grid">
              {game.players.map((p) => (
                <section
                  className={`panel seat-card${dropSeat === p.id ? ' role-drop-target' : ''}`}
                  key={p.id}
                  onDragOver={(event) => {
                    if (game.phase !== 'lobby') return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropSeat(p.id);
                  }}
                  onDragLeave={() => setDropSeat('')}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDropSeat('');
                    void assignSeatRole(
                      p.id,
                      event.dataTransfer.getData('text/plain'),
                    );
                  }}
                >
                  <PlayerAvatar
                    avatar={p.avatar}
                    id={p.id}
                    dead={!p.alive}
                    deathEffect={p.deathEffect}
                    publicDead={!p.publicAlive}
                  />
                  <p className="eyebrow">
                    SEAT {p.seat.toString().padStart(2, '0')} ·{' '}
                    {p.alive ? 'ALIVE' : 'DEAD'}
                  </p>
                  <h2>
                    {p.name}
                    {p.departed ? ' · Left table' : ''}
                  </h2>
                  {game.host && (
                    <p className="role-name">
                      <RoleIcon role={p.role ?? ''} /> (
                      {role(p.role ?? '')?.name || 'Assign a character'})
                      {p.role === 'drunk' && (
                        <small>Shown {role(p.shown ?? '')?.name || '—'}</small>
                      )}
                    </p>
                  )}
                  <p className="muted">
                    {p.ghost ? 'Dead vote available' : 'Dead vote spent'}
                    {p.nominated ? ' · Nominated today' : ''}
                    {p.hasNominated ? ' · Nomination used' : ''}
                  </p>
                  {game.host && (
                    <>
                      {game.phase === 'lobby' && (
                        <div className="seat-role-assignment">
                          <label className="field">
                            Assign character
                            <select
                              aria-label={`Assign character to ${p.name}`}
                              disabled={busy || !socket.connected}
                              value={p.role ?? ''}
                              onChange={(event) =>
                                void assignSeatRole(p.id, event.target.value)
                              }
                            >
                              <option value="">Choose a character</option>
                              {scriptRoles(game.script).map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {selectedRole && (
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy || !socket.connected}
                              onClick={() =>
                                void assignSeatRole(p.id, selectedRole)
                              }
                            >
                              Assign {role(selectedRole)?.name}
                            </button>
                          )}
                        </div>
                      )}
                      <p className="tags">
                        {p.feared ? 'FEARED ' : ''}
                        {p.protected ? 'PROTECTED ' : ''}
                        {p.used ? 'ABILITY USED' : ''}
                      </p>
                      {p.notes && <p>{p.notes}</p>}
                      <button
                        className="secondary"
                        onClick={() => {
                          setChatPlayer(p.id);
                          setActiveTab('messages');
                        }}
                      >
                        Open conversation
                      </button>
                      {button(
                        game.controls.find(
                          (c) =>
                            c.action === 'edit' && c.fields[0].value === p.id,
                        )!,
                      )}
                    </>
                  )}
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </TabsContent>
  );
}
