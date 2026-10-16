'use client';
import { RoleAbility, RoleName } from '@/components/role-text';
import { NightRite } from '@/components/rite/night-rite';
import { ShareInvite } from '@/components/share-invite';
import { StorytellerVote } from '@/components/storyteller-vote';
import { TableSeating } from '@/components/table-seating';
import { TabsContent } from '@/components/ui/tabs';
import { InviteFriends } from '@/components/social/invite-friends';
import { RoleTipsPanel } from '@/components/role-tips';
import { type TableContext } from './display.tsx';
export function TableFlow({
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
}: Pick<
  TableContext,
  | 'game'
  | 'refresh'
  | 'core'
  | 'setActiveTab'
  | 'pendingDeath'
  | 'first'
  | 'name'
  | 'button'
  | 'setRevealed'
  | 'revealed'
>) {
  return (
    <TabsContent value="flow">
      {(!game.host || game.phase !== 'lobby') && (
        <NightRite key={`${game.code}:${game.me}:play`} game={game} />
      )}
      {game.character && (
        <RoleTipsPanel
          tips={game.character.tips}
          script={game.script}
          roleId={game.character.id}
          session={`${game.code}:${game.me}`}
        />
      )}
      {game.phase === 'lobby' && (
        <div data-tutorial="seating">
          <TableSeating game={game} refresh={refresh} />
        </div>
      )}
      <div className="workspace-grid flow-dashboard">
        {(game.host ||
          game.phase !== 'night' ||
          core.length > 0 ||
          game.hints.length > 0) && (
          <section className="panel flow-panel" data-tutorial="flow-panel">
            {game.phase !== 'night' && (
              <p className="eyebrow">
                {game.phase === 'lobby' ? 'SESSION SETUP' : 'TOWN SQUARE'}
              </p>
            )}
            {game.phase === 'lobby' ? (
              <>
                <h2>
                  {game.host ? 'Invite your players.' : 'You’re at the table.'}
                </h2>
                <p className="muted">
                  {game.host
                    ? 'Share the code ' +
                      game.code +
                      '. Players join on their own devices. Randomly assign roles below, or choose each character manually in Seats.'
                    : 'Your Storyteller will assign characters and begin the game. Keep this screen open.'}
                </p>
                <p data-tutorial="script">
                  <strong>Selected script:</strong> {game.scriptName}
                </p>
                <p>
                  <strong>Storyteller:</strong> {game.hostName}
                </p>
                <div className="code-display" data-tutorial="session-code">
                  {game.code}
                </div>
                {game.host && !game.sandboxHost && (
                  <ShareInvite code={game.code} />
                )}
                {game.host && (
                  <div className="checklist">
                    <button
                      className="secondary"
                      onClick={() => setActiveTab('seats')}
                    >
                      Manually assign roles
                    </button>
                    {game.issues.length ? (
                      game.issues.map((s) => <p key={s}>{s}</p>)
                    ) : (
                      <p>All setup checks passed. Ready to deal.</p>
                    )}
                  </div>
                )}
                <div data-tutorial="invite-friends">
                  <InviteFriends code={game.code} />
                </div>
              </>
            ) : game.phase === 'night' ? (
              game.host ? (
                <>
                  <h2>
                    {pendingDeath
                      ? pendingDeath.title
                      : game.pendingBodyguard
                        ? 'Waiting for the Bodyguard'
                        : first?.name || 'The night is complete.'}
                  </h2>
                  <p className="muted">
                    {pendingDeath
                      ? 'Resolve this death before the next night task: prevention, the Fateweaver, then any triggered abilities.'
                      : game.pendingBodyguard
                        ? `${game.pendingBodyguard} has been told who will die and may take their place.`
                        : first
                          ? game.nightConfirmation?.choice
                            ? 'The player sent their choice. Open the action to review and confirm it.'
                            : 'Waiting for the player’s choice, or open the action to enter it yourself.'
                          : 'Review the town, then announce dawn.'}
                  </p>
                  <ol className="night-list">
                    {game.tasks.map((t, i) => (
                      <li
                        key={t.key}
                        className={
                          t.done
                            ? 'completed'
                            : first?.key === t.key
                              ? 'current'
                              : ''
                        }
                      >
                        <span>
                          {t.done ? '✓' : String(i + 1).padStart(2, '0')}
                        </span>
                        {t.name}
                        <small>
                          {t.done
                            ? 'Complete'
                            : first?.key === t.key
                              ? 'Up next'
                              : ''}
                        </small>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null
            ) : (
              <>
                <h2>
                  {game.active
                    ? name(game.active.target) + ' is nominated'
                    : game.phase === 'discovery'
                      ? 'Find a quiet conversation.'
                      : game.phase === 'discussion'
                        ? 'Let the town talk.'
                        : game.phase === 'nomination'
                          ? 'Who will you nominate?'
                          : game.phase === 'dayReview'
                            ? 'The day’s decision.'
                            : 'Thank you for playing.'}
                </h2>
                <p className="muted">
                  {game.active
                    ? `Nominated by ${name(game.active.by)}. ${game.active.threshold} yes votes needed to qualify for execution.`
                    : game.phase === 'discovery'
                      ? 'Speak with other players and compare what you know.'
                      : game.phase === 'discussion'
                        ? 'Share information and suspicions with the whole group.'
                        : game.phase === 'nomination'
                          ? 'Each living player may nominate once today.'
                          : game.phase === 'dayReview'
                            ? 'The Storyteller confirms the execution and any character effects before the next night.'
                            : ''}
                </p>
                {game.active && (
                  <p className="ballot-callout">
                    {game.phase === 'defense'
                      ? 'Defense is in progress.'
                      : game.host
                        ? 'Votes are visible to everyone.'
                        : !game.active.eligible.includes(game.me)
                          ? 'You do not vote on this nomination.'
                          : !game.active.myVoteSubmitted
                            ? 'Your vote has not been submitted.'
                            : game.active.myVote === null
                              ? 'Your vote: ABSTAIN'
                              : game.active.myVote
                                ? 'Your vote: YES'
                                : 'Your vote: NO'}
                  </p>
                )}
                {game.active && game.phase === 'voting' && (
                  <section className="public-votes" aria-label="Live votes">
                    <h3>
                      Live votes ·{' '}
                      {
                        game.active.eligible.filter((id) =>
                          Object.hasOwn(game.active!.votes, id),
                        ).length
                      }
                      /{game.active.eligible.length} answered
                    </h3>
                    <p className="muted">
                      Voting ends as soon as all eligible players answer. The
                      nominee does not vote. After voting, nominations resume
                      with 30 extra seconds.
                    </p>
                    {game.players.map((p) => (
                      <div className="membership-row" key={p.id}>
                        <span>{p.name}</span>
                        <strong>
                          {p.id === game.active!.target
                            ? 'Nominee'
                            : !game.active!.eligible.includes(p.id)
                              ? 'Not voting'
                              : game.active!.votes[p.id] === true
                                ? 'Yes'
                                : game.active!.votes[p.id] === false
                                  ? 'No'
                                  : game.active!.votes[p.id] === null
                                    ? 'Abstained'
                                    : 'Waiting'}
                        </strong>
                        {game.host && game.active!.eligible.includes(p.id) && (
                          <StorytellerVote
                            player={p.id}
                            name={p.name}
                            ballot={game.active!.id}
                            vote={game.active!.votes[p.id]}
                            version={game.version}
                            completed={false}
                            refresh={refresh}
                          />
                        )}
                      </div>
                    ))}
                  </section>
                )}
                {game.ballots.length > 0 && (
                  <div className="ballots">
                    {game.ballots.map((b) => (
                      <div key={b.id}>
                        <span>{name(b.target)}</span>
                        <strong>
                          {b.count} <small>yes</small>
                        </strong>
                        <details className="ballot-vote-details">
                          <summary>View submitted votes</summary>
                          <p className="muted">
                            Character rules may affect the counted total.
                            Unanswered votes are recorded as abstentions when
                            voting closes.
                          </p>
                          {b.correctable && (
                            <p className="hint">
                              Storyteller: change a vote below before the next
                              nomination. Totals update immediately.
                            </p>
                          )}
                          {Object.entries(b.votes).map(([id, yes]) => (
                            <p key={id}>
                              {name(id)}:{' '}
                              {id === b.target
                                ? 'Nominee · not counted'
                                : yes === null
                                  ? 'Abstained'
                                  : yes
                                    ? 'Yes'
                                    : 'No'}
                              {b.correctable && b.eligible.includes(id) && (
                                <StorytellerVote
                                  player={id}
                                  name={name(id)}
                                  ballot={b.id}
                                  vote={yes}
                                  version={game.version}
                                  completed={true}
                                  refresh={refresh}
                                />
                              )}
                            </p>
                          ))}
                        </details>
                      </div>
                    ))}
                    <p>
                      {game.leader.tied
                        ? 'Tied for the lead · no execution'
                        : game.leader.target
                          ? game.leader.name + ' leads the vote'
                          : 'No qualifying nominee'}
                    </p>
                  </div>
                )}
              </>
            )}
            {game.hints.map((h) => (
              <p className="error" key={h}>
                {h}
              </p>
            ))}
            <div className="actions" data-tutorial="flow-actions">
              {core.map((c, i) => button(c, i === 0))}
            </div>
          </section>
        )}
        {!game.host && game.phase !== 'lobby' && game.character && (
          <section className="panel character-panel">
            <button
              className="secondary full"
              data-tutorial="character-reveal"
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? 'Hide character' : 'Reveal my character'}
            </button>
            {revealed && (
              <div className="character-reveal">
                <h2>
                  <RoleName
                    id={game.character.id ?? ''}
                    fallback={game.character.name}
                  />
                </h2>
                <p className="alignment">{game.character.alignment} team</p>
                <p>
                  <RoleAbility
                    id={game.character.id}
                    fallback={game.character.description}
                  />
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </TabsContent>
  );
}
