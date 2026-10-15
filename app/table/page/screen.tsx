'use client';
import AppLink from '@/components/app-link';
import { NightRite } from '@/components/rite/night-rite';
import { LobbyExit } from '@/components/hub/lobby-exit';
import { GlossaryText } from '@/components/glossary-text';
import { NightChoiceNotice } from '@/components/night-choice-notice';
import { TableNightChoice } from '@/components/table-night-choice';
import { NightIntroduction } from '@/components/night-introduction';
import { SphinxGlimpse } from '@/components/sphinx-glimpse';
import { TableDawn } from '@/components/table-dawn';
import { GameEndPopup, SessionRecaps } from '@/components/session-recap';
import { AvatarPicker } from '@/components/avatar-picker';
import { TableAtmosphere } from '@/components/table-atmosphere';
import { SettingsPanel } from '@/components/hub/settings';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TableMessages } from '@/components/table-messages';
import { TableHistory } from '@/components/table-history';
import { TableActions, TableOnline } from '@/hooks/use-table-actions';
import { TableConnectionBanner } from '@/components/table-connection-banner';
import { TableMembership } from '@/components/table-membership';
import { RulesReference } from '@/components/rules-reference';
import { TableTutorials } from '@/components/tutorials/table-tutorials';
import { type TableContext } from './display.tsx';
import { TableHeader, TableNavigation } from './header.tsx';
import { TableFlow } from './flow.tsx';
import { TableSeats } from './seats.tsx';
import { TableActionDialog } from './dialog.tsx';
export function TableScreen({
  socket,
  game,
  tab,
  setActiveTab,
  selected,
  settingsOpen,
  name,
  online,
  setSettingsOpen,
  ownGuide,
  sandboxPov,
  setSelected,
  setSandboxPov,
  displayDeadline,
  seconds,
  nightWindowActive,
  clock,
  button,
  refresh,
  notice,
  setNotice,
  error,
  open,
  now,
  offset,
  compact,
  core,
  pendingDeath,
  first,
  setRevealed,
  revealed,
  roleError,
  selectedRole,
  setSelectedRole,
  dropSeat,
  setDropSeat,
  assignSeatRole,
  busy,
  setChatPlayer,
  chatPlayer,
  activeTab,
  riteGuides,
  actionControl,
  submit,
  confirmation,
  followChoice,
  setFollowChoice,
  effectiveValues,
  setValues,
  checkConfirmation,
}: TableContext) {
  return (
    <TableActions.Provider value={socket.fetch}>
      <TableOnline.Provider value={socket.connected}>
        <TableAtmosphere night={game.phase === 'night'}>
          <TableTutorials
            game={game}
            tab={tab}
            setTab={setActiveTab}
            dialogOpen={!!selected || settingsOpen}
          />
          <main
            className={`table-shell ${game.host ? 'host-table' : 'player-table'}`}
          >
            <TableHeader
              {...{ game, name, online, setSettingsOpen, ownGuide }}
            />
            <LobbyExit game={game} />
            {(game.sandboxHost || game.observer) && (
              <section
                className="panel sandbox-toolbar"
                aria-label={
                  game.observer
                    ? 'Observer point of view'
                    : 'Sandbox point of view'
                }
              >
                <div>
                  <p className="eyebrow">
                    {game.observer
                      ? 'OBSERVING A LIVE TABLE · READ-ONLY'
                      : 'SANDBOX · TIMERS DISABLED'}
                  </p>
                  <strong>
                    {sandboxPov === 'host'
                      ? 'Storyteller view'
                      : `Viewing as ${name(sandboxPov)}`}
                  </strong>
                  <p className="hint">
                    {socket.connected ? 'Live socket' : 'HTTP fallback'}
                    {' · '}Action RTT:{' '}
                    {socket.rtt === undefined
                      ? '—'
                      : `${Math.round(socket.rtt)} ms`}
                    {' · '}Push since send:{' '}
                    {socket.push === undefined
                      ? '—'
                      : `${Math.round(socket.push)} ms`}
                  </p>
                </div>
                <label className="field">
                  Point of view
                  <select
                    value={sandboxPov}
                    onChange={(event) => {
                      setSelected(null);
                      setSandboxPov(event.target.value);
                    }}
                  >
                    <option value="host">Storyteller</option>
                    {game.players
                      .filter((player) =>
                        game.observer ? !player.departed : player.dummy,
                      )
                      .map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                  </select>
                </label>
              </section>
            )}
            <TableConnectionBanner phase={socket.phase} retry={socket.retry} />
            <div className="table-title">
              <div>
                <h1>
                  {game.phase === 'lobby'
                    ? 'Gather your town.'
                    : game.phase === 'ended'
                      ? game.winner + ' wins.'
                      : `${game.phaseLabel}${game.phase === 'night' ? ' ' + game.night : game.day ? ' · Day ' + game.day : ''}`}
                </h1>
              </div>
              <div className="timer-toolbar">
                {(displayDeadline || game.remaining) && (
                  <div
                    data-tutorial="clock"
                    className={`clock-box ${(displayDeadline || game.remaining) && seconds <= 20 ? 'timer-urgent' : ''}`}
                  >
                    <span>
                      {nightWindowActive
                        ? 'NIGHT CHOICES'
                        : game.deadline
                          ? 'TIME REMAINING'
                          : 'PAUSED'}
                    </span>
                    <strong>{clock}</strong>
                  </div>
                )}
                {game.host && (
                  <div className="timer-actions" data-tutorial="timer-actions">
                    {game.controls
                      .filter((c) =>
                        ['pause', 'resume', 'extend'].includes(c.action),
                      )
                      .map((c) => button(c))}
                  </div>
                )}
              </div>
            </div>
            <GameEndPopup
              game={game}
              refresh={refresh}
              onReturn={() => setActiveTab('flow')}
            />
            {notice && (
              <div className="notice" aria-live="polite">
                <span>{notice}</span>
                <button
                  onClick={() => setNotice('')}
                  aria-label="Dismiss update"
                >
                  Dismiss
                </button>
              </div>
            )}
            {!selected && error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {game.host && (
              <NightChoiceNotice
                game={game}
                onReview={() => {
                  const c = game.controls.find((c) => c.action === 'night');
                  if (c) open(c);
                }}
              />
            )}
            {game.glimpse && (
              <SphinxGlimpse
                key={game.glimpse.id}
                glimpse={game.glimpse}
                now={now + offset}
              />
            )}
            {game.nightIntroduction && (
              <NightIntroduction
                key={game.nightIntroduction.id}
                information={game.nightIntroduction}
              />
            )}
            {game.nightChoice && (
              <TableNightChoice
                key={game.nightChoice.round + game.nightChoice.task}
                game={game}
                now={now + offset}
                prompt={game.nightChoice}
                refresh={refresh}
              />
            )}
            <TableDawn key={game.code + game.me} game={game} />
            <Tabs
              className="game-tabs"
              value={tab}
              onValueChange={(value) => setActiveTab(String(value))}
              orientation={compact || !game.host ? 'horizontal' : 'vertical'}
            >
              <TableNavigation {...{ game }} />
              <TabsContent value="cosmetic" data-tutorial="cosmetic-panel">
                {!game.host && game.phase === 'lobby' && (
                  <>
                    <AvatarPicker
                      key={'avatar:' + game.code + game.me}
                      game={game}
                      refresh={refresh}
                    />
                    <TableMembership
                      key={game.code + game.me}
                      game={game}
                      refresh={refresh}
                      cosmetic
                    />
                  </>
                )}
              </TabsContent>
              <TabsContent value="recap" data-tutorial="recap-panel">
                <SessionRecaps game={game} />
              </TabsContent>
              <TableFlow
                {...{
                  game,
                  refresh,
                  core,
                  setActiveTab,
                  pendingDeath,
                  first,
                  name,
                  button,
                  setRevealed,
                  revealed,
                }}
              />
              <TableSeats
                {...{
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
                }}
              />
              <TabsContent
                value="messages"
                keepMounted
                data-tutorial="messages-panel"
              >
                <TableMessages
                  key={`${game.code}:${game.me}:${game.gameStartedAt}`}
                  game={game}
                  recipient={chatPlayer}
                  onRecipient={setChatPlayer}
                  online={socket.connected}
                  refresh={refresh}
                  active={activeTab === 'messages'}
                />
              </TabsContent>
              <TabsContent value="script">
                <div className="panel" data-tutorial="rules-panel">
                  <h2>Rules & roles</h2>
                  <AppLink className="quiet-link" href="/rules">
                    Open the full reference page →
                  </AppLink>
                  <RulesReference
                    script={game.script}
                    riteGuides={riteGuides}
                  />
                </div>
              </TabsContent>
              {game.host && (
                <TabsContent value="control">
                  <NightRite
                    key={`${game.code}:${game.me}:setup`}
                    game={game}
                    mode="setup"
                  />
                  <div className="workspace-grid">
                    <section className="panel" data-tutorial="host-controls">
                      <p className="eyebrow">STORYTELLER CONTROL</p>
                      <h2>Your ruling, at every step.</h2>
                      <div className="control-list">
                        {game.controls
                          .filter((c) =>
                            [
                              'configure',
                              'undo',
                              'rewind',
                              'end',
                              'overridePhase',
                            ].includes(c.action),
                          )
                          .map((c) => (
                            <div key={c.action}>
                              <p>
                                <GlossaryText text={c.description} />
                              </p>
                              {button(c)}
                            </div>
                          ))}
                      </div>
                    </section>
                    <TableHistory
                      key={`${game.code}:${game.me}:${game.gameStartedAt}`}
                      game={game}
                      open={open}
                    />
                  </div>
                </TabsContent>
              )}
            </Tabs>
            <TableActionDialog
              {...{
                selected,
                busy,
                setSelected,
                actionControl,
                submit,
                confirmation,
                socket,
                game,
                open,
                name,
                followChoice,
                setFollowChoice,
                effectiveValues,
                setValues,
                error,
                checkConfirmation,
              }}
            />
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogContent className="settings-dialog">
                <DialogHeader>
                  <DialogTitle>Settings</DialogTitle>
                </DialogHeader>
                <SettingsPanel />
              </DialogContent>
            </Dialog>
          </main>
        </TableAtmosphere>
      </TableOnline.Provider>
    </TableActions.Provider>
  );
}
