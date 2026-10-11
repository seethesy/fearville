import {
  validAvatar,
  isPresetAvatar,
  resolvedAvatars,
  assignAvatars,
} from './avatars.ts';
import { validDeathEffect } from './cosmetics.ts';
import {
  role,
  scriptRoles,
  uuid,
  newPlayer,
  phaseName,
  MAX_PLAYERS,
  type Game,
  type Actor,
  type Command,
  type Player,
  type Phase,
} from './types.ts';
import { assignRandomRoles } from './assignment.ts';
import { recapOf, returnToLobby } from './lobby.ts';
import {
  isMoon,
  hms,
  hmsTasks,
  choiceTasks,
  choiceSpec,
  afterNightChoice,
  nightChoicesReady,
  nightChoiceDeadlineFor,
  validateChoice,
  hmsSetupIssues,
  hmsBeginNight,
  hmsResolve,
  hmsDawn,
  hmsWinHints,
  hmsAction,
  applyStartState,
  pendingDeath,
  requireNoPendingDeath,
  ST,
} from './hms.ts';
import { isHof, hofFinish, hofAnnounceCharges } from './hof.ts';
import { savedGame } from './saved-state.ts';
import { beginRiteNight, tickRite, riteReady, resolveRite, riteAction, riteSetupCheck } from '../rite/engine.ts';
export function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function person(g: Game, id: unknown) {
  const p = g.players.find((p) => p.id === id);
  requireThat(p, 'Player not found.');
  return p;
}
export const nameOf = (g: Game, id: string) =>
  id === 'storyteller'
    ? 'the Storyteller'
    : g.players.find((p) => p.id === id)?.name || 'Nobody';
export const healthy = (p: Player) =>
  !p.poisoned && p.role !== 'drunk' && !p.drunk && !p.feared;
export const evil = (p: Player) =>
  ['minion', 'demon'].includes(role(p.role)?.team || '');
// Travelers are neutral: neither good nor evil.
export const alignment = (p: Player): 'good' | 'evil' | 'neutral' =>
  evil(p) ? 'evil' : role(p.role)?.team === 'traveler' ? 'neutral' : 'good';
export function log(g: Game, text: string, at: number, visible = false) {
  g.log.push({ id: uuid(), text, at, public: visible });
}
export function message(
  g: Game,
  to: string,
  text: string,
  at: number,
  kind: 'chat' | 'info' | 'correction' = 'info',
  from = 'host',
) {
  requireThat(text.length <= 12000, 'Message is too long.');
  g.messages.push({
    id: uuid(),
    from,
    to,
    text,
    at,
    kind,
    ...(to.startsWith('channel:') && g.hms?.channel
      ? { participants: [g.hms.channel.a, g.hms.channel.b] }
      : {}),
  });
}
export function snapshot(g: Game, text: string, at: number) {
  const {
    history: _history,
    messages: _messages,
    log: _log,
    notebooks: _notebooks,
    recaps: _recaps,
    ...state
  } = g;
  g.history.push({ id: uuid(), text, at, before: JSON.stringify(state) });
}
export function setPhase(g: Game, phase: Phase, at: number, seconds?: number) {
  if (g.phase === 'ended' && phase !== 'ended') {
    delete g.gameEndedAt;
    delete g.mvpVotes;
  }
  g.phase = phase;
  if (phase === 'ended') {
    g.gameEndedAt ??= at;
    g.players.forEach((p) => (p.publicAlive = p.alive));
    if (isHof(g)) hofFinish(g, at);
  }
  g.remaining = g.sandbox ? 0 : (seconds ?? g.timers[phase] ?? 0);
  g.deadline = g.sandbox ? null : g.remaining ? at + g.remaining * 1000 : null;
  log(g, phaseName[phase] + (g.day ? ' · Day ' + g.day : ''), at, true);
}
export function beginNight(g: Game, at: number) {
  g.night++;
  g.nightChoices = {};
  g.nightChoiceDeadlines = {};
  g.nightIntroductions = {};
  g.nightChoiceRound = uuid();
  g.done = [];
  g.deferredNightTasks = [];
  g.active = null;
  g.players.forEach((p) => {
    p.poisoned = false;
    p.protected = false;
    p.master = '';
  });
  setPhase(g, 'night', at);
  g.nightChoiceDeadline = g.sandbox
    ? Number.MAX_SAFE_INTEGER
    : at + (g.timers.nightChoice ?? 60) * 1000;
  hmsBeginNight(g);
  g.nightChoiceTasks = choiceTasks(g);
  beginRiteNight(g, at);
  if(g.rite?.infoNight===g.night) {
    for(const p of g.players.filter(p=>p.alive && !p.departed)) {
      const target=g.players.find(q=>q.id===p.charge);
      const text=target && (p.role==='executioner'||p.role==='guardian') ? `Your ${p.role==='guardian'?'ward':'execution target'} remains ${target.name}.` : g.hms?.constellation?.owner===p.id ? `Your Constellation remains ${g.hms.constellation.members.map(id=>nameOf(g,id)).join(', ')}. Its link ${g.hms.constellation.linked?'is active':'remains broken'}.` : '';
      if(text) g.messages.push({id:uuid(),from:'host',to:p.id,text,at,kind:'info'});
    }
  }
}

export function tasks(g: Game) {
  const defer = <T extends { key: string; done: boolean }>(items: T[]) => {
    const later = new Set(g.deferredNightTasks ?? []);
    return items.sort(
      (a, b) => Number(later.has(a.key)) - Number(later.has(b.key)),
    );
  };
  return defer(hmsTasks(g));
}

export function nightChoiceTask(g: Game, player?: string) {
  if (g.phase !== 'night') return null;

  if (!player) return null;
  const task = (g.nightChoiceTasks ?? []).find(
    (t) => t.player === player && !g.done.includes(t.key) && choiceSpec(g, t),
  );
  if (!task) return null;
  const spec = choiceSpec(g, task)!;
  return {
    ...task,
    round: g.nightChoiceRound ?? `${g.gameStartedAt ?? 0}:${g.night}`,
    count: spec.count,
    text: spec.text,
    guesses: spec.guesses,
    members: spec.members,
    optional: spec.optional,
    label: spec.label,
    flag: spec.flag,
    options: g.players
      .filter((p) => !p.departed)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        eligible: spec.eligible(p),
      })),
  };
}

export function setupIssues(g: Game) {
  const seats = g.players.some((p) => p.seat < 1)
    ? ['Every player must claim a seat before roles are dealt.']
    : [];
  return [...seats, ...hmsSetupIssues(g)];
}

export function candidate(g: Game) {
  const eligible = g.ballots.filter(
    (b) => b.count !== undefined && b.count >= b.threshold,
  );
  const max = Math.max(0, ...eligible.map((b) => b.count!));
  const top = eligible.filter((b) => b.count === max);
  return {
    target: top.length === 1 ? top[0].target : '',
    count: max,
    tied: top.length > 1,
  };
}
export function winHints(g: Game) {
  return hmsWinHints(g);
}
function automaticWinner(g: Game) {
  const alive = g.players.filter((p) => p.alive);
  if (g.players.some((p) => p.role === 'atheist'))
    return alive.length <= 2 ? 'Evil' : '';
  if (!alive.some((p) => role(p.role)?.team === 'demon')) return 'Good';
  return alive.length <= 2 ? 'Evil' : '';
}

export function death(g: Game, p: Player, at: number, reason: string) {
  if (!p.alive) return;
  p.alive = false;
  p.nightDeath = g.phase === 'night' ? g.night : 0;
  if (g.phase !== 'night') p.publicAlive = false;
  log(g, `${p.name} died (${reason}).`, at, g.phase !== 'night');
}

export function eligibleVoters(g: Game) {
  return g.players.filter(
    (p) => p.id !== g.active?.target && !p.departed && (p.alive || p.ghost),
  );
}
export function finishVotingIfReady(g: Game, at: number) {
  if (g.phase !== 'voting' || !g.active) return false;
  if (!eligibleVoters(g).every((p) => Object.hasOwn(g.active!.votes, p.id)))
    return false;
  snapshot(g, 'All eligible votes received', at);
  tally(g, at);
  return true;
}
export function tally(g: Game, at: number) {
  const b = g.active;
  requireThat(b, 'No active ballot.');
  b.voterState = g.players.map(
    ({ id, alive, ghost, departed, role, poisoned, master }) => ({
      id,
      alive,
      ghost,
      departed,
      role,
      poisoned,
      master,
    }),
  );
  for (const p of eligibleVoters(g))
    if (!Object.hasOwn(b.votes, p.id)) b.votes[p.id] = null;
  b.invalid = [];
  b.spentGhosts = [];
  b.threshold = Math.ceil(g.players.filter((p) => p.alive).length / 2);
  const valid = new Set(
    g.players
      .filter(
        (p) =>
          p.id !== b.target &&
          !p.departed &&
          b.votes[p.id] === true &&
          (p.alive || p.ghost),
      )
      .map((p) => p.id),
  );
  b.count = valid.size;
  for (const p of g.players) {
    if (!p.alive && valid.has(p.id)) {
      p.ghost = false;
      b.spentGhosts.push(p.id);
    }
  }
  g.ballots.push(b);
  g.active = null;
  log(
    g,
    `${nameOf(g, b.target)} received ${b.count} yes votes (threshold ${b.threshold}).`,
    at,
    true,
  );
  g.nominationRemaining += 30;
  setPhase(g, 'nomination', at, g.nominationRemaining);
  if (g.nominationRemaining <= 0) setPhase(g, 'dayReview', at);
}
export function tick(g: Game, now: number) {
  const riteChanged = tickRite(g, now);
  if (g.sandbox) return riteChanged;
  let changed =
    g.deadline !== null && g.deadline > now && finishVotingIfReady(g, now);
  for (let n = 0; n < 8 && g.deadline !== null && g.deadline <= now; n++) {
    const at = g.deadline;
    snapshot(g, `${phaseName[g.phase]} timer ended`, at);
    changed = true;
    switch (g.phase) {
      case 'discovery':
        setPhase(g, 'discussion', at);
        break;
      case 'discussion':
        setPhase(g, 'nomination', at);
        break;
      case 'nomination':
        setPhase(g, 'dayReview', at);
        break;
      case 'defense':
        setPhase(g, 'voting', at);
        break;
      case 'voting':
        tally(g, at);
        break;
      default:
        g.deadline = null;
    }
  }
  return changed || riteChanged;
}
function clean(x: unknown, max = 500) {
  return (
    typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
      ? String(x)
      : ''
  )
    .trim()
    .slice(0, max);
}
function override(c: Command) {
  return !!c.override;
}
function enforce(condition: unknown, message: string, c: Command) {
  requireThat(
    condition || override(c),
    message + ' Use a Storyteller override if needed.',
  );
}
function executeCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string {
  requireThat(
    actor.host || g.players.some((p) => p.id === actor.id && !p.departed),
    'This seat is no longer available.',
  );
  if(c.action === 'configureRite' || c.action.startsWith('rite')) {
    if (['configureRite', 'riteForce', 'riteRedeal'].includes(c.action) && actor.host) snapshot(g, 'Night Rite: ' + c.action, now);
    return riteAction(g, actor, c, now)!;
  }
  const hostActions = [
    'addDummy',
    'removeDummy',
    'setScript',
    'correctVote',
    'moveSeat',
    'assignRole',
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
  if (c.action === 'claimSeat' || c.action === 'leaveSeat') {
    requireThat(g.phase === 'lobby', 'Seats can only be changed in the lobby.');
    requireThat(!actor.host, 'Players choose their own seats.');
    const player = person(g, actor.id);
    if (c.action === 'leaveSeat') player.seat = 0;
    else {
      const seat = Number(c.seat);
      requireThat(
        Number.isInteger(seat) && seat >= 1 && seat <= 15,
        'Choose a valid seat.',
      );
      requireThat(
        player.seat === 0,
        'Leave your current seat before claiming another.',
      );
      requireThat(
        !g.players.some((p) => p.seat === seat),
        'That seat was just claimed. Choose another.',
      );
      player.seat = seat;
    }
    g.history = [];
    return c.action === 'leaveSeat' ? 'Seat released.' : 'Seat claimed.';
  }
  if (c.action === 'mvpVote') {
    const current = g.phase === 'ended' ? recapOf(g, now) : null;
    const recap =
      current?.id === c.recap
        ? current
        : g.recaps?.find((r) => r.id === c.recap);
    requireThat(recap, 'Choose a completed session.');
    requireThat(
      actor.host || recap.players.some((p) => p.id === actor.id),
      'Only participants can vote.',
    );
    const target = clean(c.player);
    requireThat(
      recap.players.some((p) => p.id === target),
      'Choose a player from this session.',
    );
    requireThat(
      actor.host || target !== actor.id,
      'You cannot vote for yourself.',
    );
    const votes =
      current === recap ? (g.mvpVotes ??= {}) : (recap.votes ??= {});
    const key = actor.host ? 'host' : actor.id;
    const picks = votes[key] ?? [];
    requireThat(!picks.includes(target), 'You already voted for this player.');
    requireThat(
      picks.length < (actor.host ? 3 : 1),
      'You have used all your MVP votes.',
    );
    votes[key] = [...picks, target];
    return 'MVP vote saved.';
  }
  if (c.action === 'saveNotebook') {
    requireThat(!actor.host, 'Only players have notebooks.');
    const book = c.notebook as import('./types.ts').Notebook;
    requireThat(
      book && typeof book.text === 'string' && book.text.length <= 12000,
      'Notes are too long.',
    );
    requireThat(
      book.roles && book.players && JSON.stringify(book).length <= 16000,
      'Invalid notebook.',
    );
    requireThat(
      Object.entries(book.roles).every(
        ([id, v]) => role(id) && [0, 1, 2].includes(v),
      ),
      'Invalid role notes.',
    );
    requireThat(
      Object.values(book.players).every(
        (v) =>
          v &&
          typeof v.role === 'string' &&
          typeof v.confidence === 'string' &&
          ['', 'confirmed', 'suspected'].includes(v.confidence) &&
          (!v.role || role(v.role)),
      ),
      'Invalid player notes.',
    );
    if (c.started === g.gameStartedAt && g.gameStartedAt !== undefined)
      (g.notebooks ??= {})[actor.id] = structuredClone(book);
    else {
      const archived = g.recaps
        ?.find((r) => r.started !== undefined && r.started === c.started)
        ?.players.find((p) => p.id === actor.id);
      requireThat(archived, 'This notebook belongs to a different game.');
      archived.notebook = structuredClone(book);
    }
    return 'Notes saved.';
  }
  if (c.action === 'setAvatar') {
    requireThat(
      g.phase === 'lobby',
      'Appearance can only be changed in the pregame lobby.',
    );
    const player = g.players.find((p) => p.id === actor.id && !p.departed);
    requireThat(
      !actor.host && player,
      'Choose your own player seat to change its avatar.',
    );
    requireThat(
      validAvatar(c.avatar),
      'Choose a preset or a small JPEG portrait.',
    );
    requireThat(
      c.deathEffect === undefined || validDeathEffect(c.deathEffect),
      'Choose a death effect.',
    );
    const avatars = resolvedAvatars(g.players);
    requireThat(
      !isPresetAvatar(c.avatar) ||
        !g.players.some(
          (p) => p.id !== player.id && avatars.get(p.id) === c.avatar,
        ),
      'That preset avatar is already taken. Choose an available preset or upload a photo.',
    );
    assignAvatars(g.players);
    player.avatar = c.avatar;
    if (validDeathEffect(c.deathEffect)) player.deathEffect = c.deathEffect;
    return 'Avatar updated.';
  }
  if (c.action === 'returnLobby') {
    if (g.phase === 'lobby') return 'Already in the lobby.';
    requireThat(
      c.recap === undefined || c.recap === recapOf(g, now).id,
      'This is a different game. Review its recap first.',
    );
    requireThat(
      g.phase === 'ended',
      'The game must end before returning to the lobby.',
    );
    return returnToLobby(g, now);
  }
  if (c.action === 'nightDefer') {
    requireThat(g.phase === 'night', 'It is not night.');
    const task = tasks(g).find((t) => !t.done);
    requireThat(task, 'No night task remains.');
    g.deferredNightTasks ??= [];
    requireThat(
      !g.deferredNightTasks.includes(task.key),
      'This is the last deferred task. Resolve or skip it before dawn.',
    );
    g.deferredNightTasks.push(task.key);
    return `Set ${task.name} aside. It will return after the other night tasks.`;
  }
  if (c.action === 'nightChoice') {
    const task = nightChoiceTask(g, actor.id);
    requireThat(
      !task || now < nightChoiceDeadlineFor(g, task),
      'The night choice timer has ended. The Storyteller will decide.',
    );
    requireThat(
      !actor.host &&
        task &&
        task.player === actor.id &&
        task.key === c.task &&
        task.round === c.round,
      'This night choice is no longer available.',
    );

    g.nightChoices ??= {};
    g.nightChoices[task.key] = validateChoice(g, task, c);
    afterNightChoice(g, task, now);
    return g.nightChoices[task.key].pass
      ? 'Pass sent. The Storyteller will confirm.'
      : 'Choice sent. Waiting for the Storyteller to confirm.';
  }

  if (c.action === 'chat') {
    const channel = g.hms?.channel;
    const to =
      c.to === 'channel' &&
      channel &&
      g.phase === 'night' &&
      (actor.id === channel.a || actor.id === channel.b)
        ? 'channel:' + channel.id
        : actor.host
          ? clean(c.to)
          : 'host';
    requireThat(
      to.startsWith('channel:') ||
        to === 'host' ||
        to === 'all' ||
        g.players.some((p) => p.id === to && !p.departed),
      'Choose a recipient.',
    );
    const text = clean(c.text, 4000);
    requireThat(text, 'Write a message.');
    if (c.messageId !== undefined) {
      requireThat(
        typeof c.messageId === 'string' && /^[a-f0-9-]{36}$/i.test(c.messageId),
        'Invalid message identifier.',
      );
      const previous = g.messages.find((m) => m.id === c.messageId);
      if (previous) {
        requireThat(
          previous.from === actor.id &&
            previous.to === to &&
            previous.text === text,
          'Message identifier already used.',
        );
        return 'Message sent.';
      }
    }
    message(g, to, text, now, 'chat', actor.id);
    if (to.startsWith('channel:'))
      return 'Message sent through the Medium’s channel.';
    if (typeof c.messageId === 'string')
      g.messages[g.messages.length - 1].id = c.messageId;
    return (
      'Send this message ' +
      (to === 'all'
        ? 'to everyone'
        : `to ${to === 'host' ? 'the Storyteller' : nameOf(g, to)}`) +
      ':\n' +
      text
    );
  }
  if (c.action === 'undo' || c.action === 'rewind') {
    const index =
      c.action === 'undo'
        ? g.history.length - 1
        : g.history.findIndex((h) => h.id === c.history);
    requireThat(index >= 0, 'No saved decision to restore.');
    const entry = g.history[index];
    const state = savedGame(entry.before);
    requireThat(
      g.players.every((p) => state.players.some((q: Player) => q.id === p.id)),
      'Cannot rewind before a player joined. Correct seats manually.',
    );
    delete g.nightChoiceRound;
    delete g.nightChoices;
    delete g.nightChoiceDeadlines;
    delete g.nightIntroductions;
    delete g.nightChoiceDeadline;
    delete g.nightChoiceTasks;
    delete g.script;
    delete g.dawnAnnouncement;
    delete g.hms;
    delete g.gameEndedAt;
    delete g.mvpVotes;
    delete g.rite;
    Object.assign(g, state);
    g.history = g.history.slice(0, index);
    if (g.deadline !== null) {
      g.remaining = Math.max(1, Math.ceil((g.deadline - entry.at) / 1000));
      g.deadline = null;
    }
    message(
      g,
      'all',
      'The Storyteller corrected an earlier decision. Check the current phase and your character. Previously delivered information cannot be unseen.',
      now,
      'correction',
    );
    log(g, `Restored state before: ${entry.text}`, now, true);
    return (
      'Restore the entire game state before “' +
      entry.text +
      '”. Later game decisions will be reverted; messages remain, and any active timer will be paused.'
    );
  }
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
  switch (c.action) {
    case 'addDummy': {
      requireThat(g.sandbox, 'Dummy players are only available in Sandbox.');
      requireThat(g.players.length < MAX_PLAYERS, 'This table is full.');
      const name = clean(c.name, 32);
      requireThat(name, 'Enter a dummy player name.');
      assignAvatars(g.players);
      const player = newPlayer(name, g.players.length + 1);
      player.dummy = true;
      g.players.push(player);
      assignAvatars(g.players);
      log(g, `${name} was added as a dummy player.`, now, true);
      return `Add ${name} to the Sandbox.`;
    }
    case 'removeDummy': {
      requireThat(g.sandbox, 'Dummy players are only available in Sandbox.');
      const player = person(g, c.player);
      requireThat(player.dummy, 'Only dummy players can be removed here.');
      requireThat(g.phase === 'lobby', 'Remove dummy players from the lobby.');
      g.players = g.players.filter((p) => p.id !== player.id);
      g.players.forEach((p, index) => (p.seat = index + 1));
      return `Remove ${player.name} from the Sandbox.`;
    }
    case 'setScript': {
      requireThat(
        g.phase === 'lobby',
        'Change the role script before starting the game.',
      );
      requireThat(
        c.script === 'holyMoonStars' || c.script === 'horrors',
        'Choose a valid role script.',
      );
      g.script = c.script;
      log(g, 'Updated role script.', now, true);
      return 'Role script updated.';
    }
    case 'moveSeat':
      throw Error('Players choose their own seats in the lobby.');
    case 'randomAssign': {
      requireThat(
        g.phase === 'lobby',
        'Random assignment is only available in the lobby.',
      );
      const summary = assignRandomRoles(g, c.roles);
      g.assignmentSeed = uuid();
      log(g, 'Randomly assigned characters and setup reminders.', now);
      return summary;
    }
    case 'assignRole': {
      requireThat(g.phase === 'lobby', 'Assign characters in the lobby.');
      const p = person(g, c.player);
      const nextRole = clean(c.role);
      requireThat(
        scriptRoles(g.script).some((r) => r.id === nextRole),
        'Choose a character from this script.',
      );
      const previousRole = p.role;
      if (previousRole === nextRole) return `${p.name} already has that character.`;
      const previousOwner = g.players.find(
        (q) => q.id !== p.id && q.role === nextRole,
      );
      const assign = (target: Player, id: string) => {
        target.role = id;
        target.shown = id;
        delete target.acts;
        delete target.charge;
        target.drunk = false;
        target.feared = false;
      };
      if (previousOwner) assign(previousOwner, previousRole);
      assign(p, nextRole);
      log(g, `Assigned ${role(nextRole)?.name} to ${p.name}.`, now);
      return previousOwner
        ? `Assigned ${role(nextRole)?.name} to ${p.name} and ${previousRole ? 'swapped' : 'cleared'} ${previousOwner.name}'s character.`
        : `Assigned ${role(nextRole)?.name} to ${p.name}.`;
    }
    case 'configure': {
      if (!g.sandbox)
        for (const key of Object.keys({ nightChoice: 60, ...g.timers })) {
          const n = Number(
            c[key] ??
              (key === 'nightChoice'
                ? (g.timers.nightChoice ?? 60)
                : undefined),
          );
          requireThat(
            Number.isInteger(n) && n >= 5 && n <= 3600,
            'Each timer must be 5–3600 seconds.',
          );
          g.timers[key] = n;
        }
      g.bluffs = [c.bluff1, c.bluff2, c.bluff3]
        .map((v) => clean(v))
        .filter(Boolean);
      g.redHerring = clean(c.redHerring);
      log(g, 'Updated timers and setup reminders.', now);
      return g.sandbox
        ? 'Save Horror bluffs and the red herring. Sandbox timers stay disabled.'
        : 'Save timers, Horror bluffs, and red herring. Active timers keep their current time.';
    }
    case 'edit': {
      const p = person(g, c.player);
      const name = clean(c.name, 32);
      requireThat(name, 'Enter a seat name.');
      requireThat(
        c.seat === undefined || Number(c.seat) === p.seat,
        'Players choose their own seats.',
      );
      p.name = name;
      requireThat(role(clean(c.role)), 'Choose a character.');
      p.role = clean(c.role);

      const shown = clean(c.shown);
      p.shown =
        p.role === 'lostsoul'
          ? shown || 'lostsoul'
          : shown && role(shown)?.team === 'townsfolk'
            ? shown
            : p.role;
      if (p.role === 'lostsoul') p.acts = clean(c.acts);
      else delete p.acts;
      p.drunk = !!c.drunk;
      p.marked = !!c.marked;
      const lives = Number(c.extraLife ?? 0);
      requireThat(
        Number.isInteger(lives) && lives >= 0 && lives <= 3,
        'Extra lives must be 0–3.',
      );
      p.extraLife = lives;
      if (isHof(g)) {
        p.feared = !!c.feared;
        const charge = clean(c.charge);
        if (['executioner', 'guardian'].includes(p.role)) {
          requireThat(
            !charge || g.players.some((q) => q.id === charge && q.id !== p.id),
            'Choose another player.',
          );
          p.charge = charge;
        } else delete p.charge;
      }
      requireThat(
        p.role !== 'drunk' || role(p.shown)?.team === 'townsfolk',
        'The Drunk must be shown a Villager.',
      );
      p.poisoned = !!c.poisoned;
      p.protected = !!c.protected;
      p.ghost = c.ghost !== false;
      p.used = !!c.used;
      p.notes = clean(c.notes, 1000);
      if (c.alive === false && p.alive)
        death(g, p, now, 'Storyteller correction');
      if (c.alive === true) {
        p.alive = true;
        p.nightDeath = 0;
      }
      if (g.phase !== 'night') p.publicAlive = p.alive;
      if (g.phase !== 'lobby')
        message(
          g,
          p.id,
          `Your character is ${role(p.shown)?.name}. Your alignment is ${alignment(p)}.`,
          now,
        );
      log(
        g,
        `Updated seat ${p.seat}: ${p.name}, actual character ${role(p.role)?.name}.`,
        now,
      );
      return `Update ${p.name} at seat ${p.seat}. Actual: ${role(p.role)?.name}; shown: ${role(p.shown)?.name}. ${g.phase !== 'lobby' ? 'Send their current character privately.' : ''}`;
    }
    case 'setRanked': {
      requireThat(actor.host, 'Only the Storyteller can choose ranked mode.');
      requireThat(
        g.phase === 'lobby',
        'Choose ranked mode before the game starts.',
      );
      requireThat(typeof c.ranked === 'boolean', 'Choose casual or ranked.');
      requireThat(!g.sandbox || !c.ranked, 'Sandbox games cannot be ranked.');
      g.ranked = c.ranked;
      return g.ranked ? 'Set this game to ranked.' : 'Set this game to casual.';
    }
    case 'start': {
      riteSetupCheck(g);
      requireThat(
        g.players.every((p) => p.seat > 0),
        'Every player must claim a seat before roles are dealt.',
      );
      requireThat(g.phase === 'lobby', 'The game has already started.');
      requireThat(
        g.players.length >= 5 && g.players.length <= MAX_PLAYERS,
        `Join 5–${MAX_PLAYERS} players before starting.`,
      );
      requireThat(
        g.players.every((p) => role(p.role)),
        'Assign all characters first.',
      );
      requireThat(
        g.players.every((p) =>
          scriptRoles(g.script).some((r) => r.id === p.role),
        ),
        'Assign characters from this script.',
      );
      const goodRoles = scriptRoles(g.script).filter((r) =>
        ['townsfolk', 'outsider'].includes(r.team),
      );
      const suppliedBluffs = [c.bluff1, c.bluff2, c.bluff3]
        .map((value) => clean(value))
        .filter(Boolean);
      if (suppliedBluffs.length) g.bluffs = suppliedBluffs;
      if (c.redHerring) g.redHerring = clean(c.redHerring);
      for (const p of g.players) {
        const shown = clean(c['shown_' + p.id]);
        const acts = clean(c['acts_' + p.id]);
        if (shown) {
          requireThat(
            goodRoles.some((r) => r.id === shown),
            'Choose a valid shown character.',
          );
          p.shown = shown;
        }
        if (acts) {
          requireThat(
            goodRoles.some((r) => r.id === acts && r.team === 'townsfolk'),
            'Choose a valid hidden Villager.',
          );
          p.acts = acts;
        }
      }
      requireThat(
        !g.players.some(
          (p) => p.role === 'drunk' && role(p.shown)?.team !== 'townsfolk',
        ),
        'Choose the Drunk’s shown Villager.',
      );
      if (isHof(g))
        for (const p of g.players)
          if (
            ['executioner', 'guardian'].includes(p.role) &&
            c['charge_' + p.id]
          )
            p.charge = clean(c['charge_' + p.id]);
      enforce(setupIssues(g).length === 0, setupIssues(g).join(' '), c);
      applyStartState(g, c);
      g.gameStartedAt = now;
      delete g.gameEndedAt;
      g.mvpVotes = {};
      g.notebooks = {};
      g.players
        .sort((a, b) => a.seat - b.seat)
        .forEach((p, i) => {
          p.seat = i + 1;
        });
      g.decisions = [];
      g.players.forEach((p) =>
        message(
          g,
          p.id,
          `Your character is ${role(p.shown || p.role)?.name}. Your alignment is ${alignment(p)}.\n${role(p.shown || p.role)?.description}`,
          now,
        ),
      );
      if (isHof(g)) hofAnnounceCharges(g, now);
      beginNight(g, now);
      return 'Deal every player their private character and begin the first night.';
    }
    case 'pause':
      requireThat(g.deadline !== null, 'No running timer.');
      g.remaining = Math.max(0, Math.ceil((g.deadline - now) / 1000));
      g.deadline = null;
      return 'Pause the shared timer for everyone.';
    case 'resume':
      requireThat(g.deadline === null && g.remaining > 0, 'No paused timer.');
      g.deadline = now + g.remaining * 1000;
      return 'Resume the shared timer.';
    case 'extend':
      requireThat(g.timers[g.phase], 'This phase has no timer.');
      {
        const seconds = Number(c.seconds);
        requireThat(
          Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600,
          'Add 1–3600 seconds.',
        );
        if (g.deadline !== null) g.deadline += seconds * 1000;
        else g.remaining += seconds;
        return `Add ${seconds} seconds.`;
      }
    case 'advance': {
      requireThat(
        ['discovery', 'discussion', 'nomination', 'defense', 'voting'].includes(
          g.phase,
        ),
        'No timed phase to advance.',
      );
      if (g.phase === 'voting') tally(g, now);
      else
        setPhase(
          g,
          (
            {
              discovery: 'discussion',
              discussion: 'nomination',
              nomination: 'dayReview',
              defense: 'voting',
            } as Record<string, Phase>
          )[g.phase],
          now,
        );
      return 'End the current timer and advance to ' + phaseName[g.phase] + '.';
    }
    case 'dawn':
      requireThat(g.phase === 'night', 'It is not night.');
      requireThat(riteReady(g, now), 'The Night Rite window is still open.');
      enforce(
        tasks(g).every((t) => t.done),
        'Night tasks remain.',
        c,
      );
      hmsDawn(g, now);
      resolveRite(g, now);
      g.dawnAnnouncement = {
        id: uuid(),
        night: g.night,
        playerIds: g.players
          .filter((p) => !p.alive && p.nightDeath === g.night)
          .map((p) => p.id),
        names: g.players
          .filter((p) => !p.alive && p.nightDeath === g.night)
          .map((p) => p.name),
      };
      g.players.forEach((p) => {
        p.publicAlive = p.alive;
        p.protected = false;
      });
      g.day = g.night;
      g.nominees = [];
      g.nominators = [];
      g.ballots = [];
      g.execution = '';
      setPhase(g, 'discovery', now);
      return (
        'Announce night deaths and begin Discovery. ' + winHints(g).join(' ')
      );
    case 'nightSkip': {
      requireThat(g.phase === 'night', 'It is not night.');
      const task = tasks(g).find((t) => !t.done);
      requireThat(task, 'All night tasks are complete.');

      requireNoPendingDeath(g);
      if (task.key === 'deaths')
        hms(g).deathQueue = hms(g).deathQueue.filter((d) => !d.night);
      if (task.key === 'plague') delete hms(g).infected;
      g.done.push(task.key);
      g.deferredNightTasks = (g.deferredNightTasks ?? []).filter(
        (key) => key !== task.key,
      );
      log(g, 'Skipped ' + task.name + '.', now);
      return (
        'Skip ' +
        task.name +
        ' without applying an effect or sending information.'
      );
    }
    case 'night': {
      requireThat(g.phase === 'night', 'It is not night.');
      const t = tasks(g).find((t) => !t.done);
      requireThat(t && t.key === c.task, 'The active night task changed.');
      const choice = g.nightChoices?.[t.key];
      requireThat(
        (c.choiceId || '') === (choice?.id || ''),
        'The player changed their choice. Review it before confirming.',
      );
      return hmsResolve(g, t, c, now);
    }
    case 'correctVote': {
      const b = g.ballots.at(-1);
      requireThat(
        !g.active &&
          ['nomination', 'dayReview'].includes(g.phase) &&
          b &&
          b.id === c.ballot &&
          b.voterState &&
          b.spentGhosts,
        'Only the latest completed ballot can be corrected before the next nomination or execution.',
      );
      const p = b.voterState.find((p) => p.id === c.player);
      requireThat(
        p && p.id !== b.target && !p.departed && (p.alive || p.ghost),
        'This player was not eligible for that ballot.',
      );
      requireThat(
        typeof c.yes === 'boolean' || c.yes === null,
        'Choose yes, no, or abstain.',
      );
      b.votes[p.id] = c.yes;
      for (const id of b.spentGhosts) person(g, id).ghost = true;
      const valid = new Set(
        b.voterState
          .filter(
            (p) =>
              p.id !== b.target &&
              !p.departed &&
              (p.alive || p.ghost) &&
              b.votes[p.id] === true,
          )
          .map((p) => p.id),
      );
      b.invalid = [];
      b.count = valid.size;
      b.spentGhosts = b.voterState
        .filter((p) => !p.alive && valid.has(p.id))
        .map((p) => p.id);
      for (const id of b.spentGhosts) person(g, id).ghost = false;
      log(
        g,
        `Storyteller changed ${nameOf(g, p.id)}'s vote to ${c.yes === null ? 'abstain' : c.yes ? 'yes' : 'no'}. ${nameOf(g, b.target)} now has ${b.count} yes votes.`,
        now,
        true,
      );
      return 'Vote corrected and ballot total updated.';
    }
    case 'nominate': {
      requireThat(g.phase === 'nomination', 'Nominations are not open.');
      const by = person(g, actor.host ? c.by : actor.id);
      if (isMoon(g) && c.target === ST) {
        enforce(
          by.alive,
          'Dead players cannot nominate.',
          actor.host ? c : ({} as Command),
        );
        enforce(
          !g.nominators.includes(by.id) && !g.nominees.includes(ST),
          'This nomination has already been made today.',
          actor.host ? c : ({} as Command),
        );
        g.nominators.push(by.id);
        g.nominees.push(ST);
        g.nominationRemaining = g.deadline
          ? Math.max(0, (g.deadline - now) / 1000)
          : g.remaining;
        g.active = {
          id: uuid(),
          by: by.id,
          target: ST,
          votes: {},
          threshold: Math.ceil(g.players.filter((p) => p.alive).length / 2),
        };
        setPhase(g, 'defense', now);
        return `${by.name} nominates the Storyteller. Start Defense.`;
      }
      const target = person(g, c.target);
      requireThat(
        target.alive && !target.departed,
        'Only living players at the table can be nominated.',
      );
      enforce(
        by.alive,
        'Dead players cannot nominate.',
        actor.host ? c : ({} as Command),
      );
      enforce(
        !g.nominators.includes(by.id),
        'This player has already nominated today.',
        actor.host ? c : ({} as Command),
      );
      enforce(
        !g.nominees.includes(target.id),
        'This player has already been nominated today.',
        actor.host ? c : ({} as Command),
      );
      g.nominators.push(by.id);
      g.nominees.push(target.id);
      g.nominationRemaining = g.deadline
        ? Math.max(0, (g.deadline - now) / 1000)
        : g.remaining;
      g.active = {
        id: uuid(),
        by: by.id,
        target: target.id,
        votes: {},
        threshold: Math.ceil(g.players.filter((p) => p.alive).length / 2),
      };
      setPhase(g, 'defense', now);
      return `${by.name} nominates ${target.name}. Start Defense.`;
    }
    case 'vote': {
      requireThat(g.phase === 'voting' && g.active, 'Voting is not open.');
      if (c.ballot !== undefined)
        requireThat(
          c.ballot === g.active.id,
          'The ballot changed. Reopen voting.',
        );
      const p = person(g, actor.host ? c.player : actor.id);
      requireThat(p.alive || p.ghost, 'Your dead vote has already been spent.');
      requireThat(
        p.id !== g.active.target && !p.departed,
        'This player is not eligible to vote on this nomination.',
      );
      requireThat(
        typeof c.yes === 'boolean' || c.yes === null,
        'Choose yes, no, or abstain.',
      );
      g.active.votes[p.id] = c.yes;
      if (finishVotingIfReady(g, now))
        return 'Vote recorded. Everyone eligible has answered; voting is complete.';
      return c.yes
        ? 'Record a yes vote. If dead, this spends your remaining vote when the ballot closes.'
        : 'Record no. A no vote does not spend a dead vote.';
    }
    case 'finishDay': {
      requireThat(g.phase === 'dayReview', 'Wait for the execution review.');

      requireNoPendingDeath(g);
      const leader = candidate(g).target;
      if (leader && !g.execution) {
        const result = hmsAction(
          g,
          { id: 'host', host: true },
          {
            action: 'execute',
            target: leader,
            atheistRuling: 'none',
          },
          now,
        );
        if (result === 'END_GAME') {
          setPhase(g, 'ended', now);
          return 'The Storyteller is executed with the Atheist in play: good wins.';
        }
        if (pendingDeath(g))
          return `${result ?? `Execute ${nameOf(g, leader)}.`} Resolve the execution death, then confirm the day outcome again.`;
      }
      const winner = automaticWinner(g);
      if (winner) {
        g.winner = winner;
        setPhase(g, 'ended', now);
        return `${winner} wins. The day outcome and win conditions were calculated automatically.`;
      }
      beginNight(g, now);
      return (
        (g.execution ? '' : 'No execution today. ') + 'Begin the next night.'
      );
    }
    case 'end': {
      requireThat(
        ['good', 'evil'].includes(clean(c.winner)),
        'Choose a winning team.',
      );
      g.winner = c.winner === 'good' ? 'Good' : 'Evil';
      setPhase(g, 'ended', now);
      return 'End the game. ' + g.winner + ' wins.';
    }
    case 'overridePhase': {
      const phases: Phase[] = [
        'night',
        'discovery',
        'discussion',
        'nomination',
        'dayReview',
      ];
      requireThat(
        phases.includes(c.phase as Phase),
        'Choose a supported phase.',
      );
      if (g.active) g.active = null;
      setPhase(g, c.phase as Phase, now);
      log(g, 'Phase changed manually.', now);
      return (
        'Jump to ' +
        phaseName[g.phase] +
        '. Active ballots are discarded. Existing daily nomination history and night tasks are preserved.'
      );
    }
    default:
      throw Error('Unknown action.');
  }
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
  if((c.action==='undo'||c.action==='rewind') && g.rite) g.rite.epoch=uuid();
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
