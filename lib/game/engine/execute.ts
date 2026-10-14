import { role, uuid, type Game, type Actor, type Command } from '../types.ts';
import { nightChoicesReady, hmsAction } from '../hms.ts';
import { riteAction } from '../../rite/engine.ts';
import { requireThat, nameOf, clean } from './shared.ts';
import { snapshot, setPhase, beginNight, tasks } from './lifecycle.ts';
import { executeSeatCommand } from './seats.ts';
import { setupCommand } from './setup.ts';
import { statusCommand } from './status.ts';
import { phaseCommand } from './phases.ts';
import { voteCommand } from './ballots.ts';
export function executeCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string {
  requireThat(
    actor.host || g.players.some((p) => p.id === actor.id && !p.departed),
    'This seat is no longer available.',
  );
  if (
    actor.host &&
    typeof c.phaseToken === 'string' &&
    !['edit', 'undo', 'rewind', 'chat'].includes(c.action)
  )
    requireThat(
      c.phaseToken === `${g.day}:${g.night}:${g.phase}`,
      'The phase changed. Choose an action for the current phase.',
    );
  if (c.action === 'configureRite' || c.action.startsWith('rite')) {
    if (
      ['configureRite', 'riteForce', 'riteRedeal', 'ritePassTurn'].includes(
        c.action,
      ) &&
      actor.host
    )
      snapshot(g, 'Night Rite: ' + c.action, now);
    return riteAction(g, actor, c, now)!;
  }
  const hostActions = [
    'addDummy',
    'removeDummy',
    'setScript',
    'setRoleDistribution',
    'resetRoleDistribution',
    'correctVote',
    'moveSeat',
    'assignRole',
    'setPlayerStatus',
    'randomAssign',
    'configure',
    'edit',
    'start',
    'pause',
    'resume',
    'extend',
    'advance',
    'dawn',
    'night',
    'nightSkip',
    'nightDefer',
    'finishDay',
    'undo',
    'rewind',
    'end',
    'overridePhase',
    'revoke',
    'resolveDeath',
    'prophetReveal',
    'soberFools',
    'execute',
  ];
  if (hostActions.includes(c.action))
    requireThat(actor.host, 'Only the Storyteller can do that.');
  const seatResult = executeSeatCommand(g, actor, c, now);
  if (seatResult !== undefined) return seatResult;
  if (!['vote', 'chat'].includes(c.action))
    snapshot(
      g,
      c.action === 'night'
        ? 'Resolve night task'
        : c.action === 'edit'
          ? 'Edit ' + nameOf(g, clean(c.player))
          : c.action,
      now,
    );
  if (
    g.phase === 'night' &&
    ['night', 'nightSkip', 'dawn'].includes(c.action)
  ) {
    requireThat(
      nightChoicesReady(g, now),
      'Wait for the night choice timer to finish.',
    );
  }

  const result = hmsAction(g, actor, c, now);
  if (result === 'END_GAME') {
    setPhase(g, 'ended', now);
    return 'The Storyteller is executed with the Atheist in play: good wins.';
  }
  if (result === 'END_DAY') {
    beginNight(g, now);
    return 'The day ends early. Night begins.';
  }
  if (result !== null) return result;
  const setupCommandResult = setupCommand(g, actor, c, now);
  if (setupCommandResult !== undefined) return setupCommandResult;
  const statusCommandResult = statusCommand(g, actor, c, now);
  if (statusCommandResult !== undefined) return statusCommandResult;
  const phaseCommandResult = phaseCommand(g, actor, c, now);
  if (phaseCommandResult !== undefined) return phaseCommandResult;
  const voteCommandResult = voteCommand(g, actor, c, now);
  if (voteCommandResult !== undefined) return voteCommandResult;
  throw Error('Unknown action.');
}
// Capture the session's complete activity independently of daily ballot resets.
export function execute(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string {
  const before = g.players.map((p) => ({ ...p }));
  const logIds = new Set(g.log.map((l) => l.id));
  const task =
    c.action === 'night' ? tasks(g).find((t) => t.key === c.task) : null;
  const ballot = g.active;
  const day = g.day,
    night = g.night;
  const summary = executeCommand(g, actor, c, now);
  if ((c.action === 'undo' || c.action === 'rewind') && g.rite)
    g.rite.epoch = uuid();
  if (
    [
      'chat',
      'returnLobby',
      'mvpVote',
      'saveNotebook',
      'setAvatar',
      'claimSeat',
      'leaveSeat',
      'undo',
      'rewind',
    ].includes(c.action) ||
    g.phase === 'lobby'
  )
    return summary;
  const involved = new Set<string>(actor.host ? [] : [actor.id]);
  if (task?.player) involved.add(task.player);
  for (const key of [
    'player',
    'by',
    'target',
    'target2',
    'target3',
    'redirect',
    'successor',
  ]) {
    if (typeof c[key] === 'string' && g.players.some((p) => p.id === c[key]))
      involved.add(c[key] as string);
  }
  for (const guess of Array.isArray(c.guesses) ? c.guesses : []) {
    if (typeof guess?.player === 'string') involved.add(guess.player);
  }
  const changes: string[] = [];
  for (const p of g.players) {
    const old = before.find((q) => q.id === p.id);
    if (!old) continue;
    for (const [key, on, off] of [
      ['alive', 'revived', 'died'],
      ['poisoned', 'poisoned', 'no longer poisoned'],
      ['protected', 'protected', 'protection ended'],
      ['drunk', 'drunk', 'sober'],
      ['marked', 'marked for death', 'death mark removed'],
    ] as const) {
      if (!!old[key] !== !!p[key]) {
        involved.add(p.id);
        changes.push(`${p.name}: ${p[key] ? on : off}.`);
      }
    }
    if (old.role !== p.role) {
      involved.add(p.id);
      changes.push(`${p.name} became ${role(p.role)?.name ?? p.role}.`);
    }
  }
  let text = summary;
  if (c.action === 'nightChoice') {
    const choice = g.nightChoices?.[clean(c.task)];
    if (choice?.text) text += `\nQuestion: ${choice.text}`;
    if (choice?.guesses?.length)
      text += `\nGuesses: ${choice.guesses.map((guess) => `${nameOf(g, guess.player)}: ${role(guess.role)?.name ?? guess.role}`).join('; ')}.`;
  }
  if (c.action === 'vote' || c.action === 'correctVote') {
    const voter = actor.host ? clean(c.player) : actor.id;
    involved.add(voter);
    const target = ballot?.target ?? g.ballots.at(-1)?.target;
    if (target) involved.add(target);
    text = `${nameOf(g, voter)} voted ${c.yes === true ? 'yes' : c.yes === false ? 'no' : 'abstain'} on ${nameOf(g, target ?? '')}.`;
  }
  const targets = [...involved].filter(
    (id) => id !== actor.id && id !== task?.player,
  );
  if (['night', 'nightChoice'].includes(c.action) && targets.length)
    text = `${task?.name ?? nameOf(g, actor.id)} — selected ${targets.map((id) => nameOf(g, id)).join(', ')}. ${text}`;
  const logs = g.log.filter((l) => !logIds.has(l.id)).map((l) => l.text);
  (g.decisions ??= []).push({
    id: uuid(),
    at: now,
    actor: actor.host ? g.hostName : nameOf(g, actor.id),
    text: [text, ...changes, ...logs.filter((l) => !text.includes(l))].join(
      '\n',
    ),
    playerIds: [...involved],
    day,
    night,
  });
  return summary;
}
